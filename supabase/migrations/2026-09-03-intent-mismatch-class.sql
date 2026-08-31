-- 2026-09-03-intent-mismatch-class.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED BY TOOLING. ✅ APPLIED TO PRODUCTION 2026-08-30 (one ordered txn with its siblings; hr_intent_replay live at md5 97f6c74e…, all twelve patched bodies verified live-vs-replay by tests/live-hash-drift.mjs 2026-08-31). ⚠⚠⚠
-- ⚠ SECURITY ACK REQUESTED (not a full review): this file changes IDEMPOTENCY
--   BEHAVIOUR on verbs that move money (hr_claim_goal, hr_trait_buy,
--   hr_bank_move, hr_bounty_spend, hr_worker_hire, hr_farm_harvest …). The
--   direction is strictly tightening — a cached envelope is now returned ONLY to
--   a caller presenting the same intent AND the same slot the key was claimed
--   for — but "the answer a retry gets" is a money-verb property and the ruling
--   should be recorded rather than assumed. Nothing here widens a grant, creates
--   a client-callable surface, or changes any payout.
--
--   APPLY AFTER EVERY MIGRATION THAT AUTHORS ONE OF THE TWELVE — which today
--   means last, but the rule is the dependency, not the position: this file
--   PATCHES twelve live function bodies programmatically (pg_get_functiondef →
--   guarded exactly-once anchor replace → execute), the 2026-08-28-client-state.sql
--   / 2026-08-23-modal-goal-claims.sql §5 idiom, so any file that authors one of
--   them must have run first or the anchor is not there to find (and this file
--   fails closed, by name, rather than half-hardening). The twelve and their
--   authoring migrations are the table in §2. It carries NO literal
--   create-or-replace for any of them and takes over NO last-toucher role. It
--   creates exactly one new function (public.hr_intent_replay) and grants it to
--   nobody.
--
--   ⚠ CONSEQUENCE OF BEING A PATCHER, STATED LOUDLY: a LATER migration that
--     restates any of the twelve bodies from a template will silently DELETE this
--     hardening — the same class of regression the b484–b487 wave was. The pin is
--     NOT this comment: tests/intent-mismatch.mjs replays the WHOLE chain (no
--     `upTo`) and fails the build if any of the twelve reaches the end of the
--     chain without the guard. Re-applying THIS file after such a migration is
--     safe and is the fix (it is idempotent — see §2).
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE DEFECT (b493/b494 security pass, finding #7, P3 — and it is a CLASS)
-- ══════════════════════════════════════════════════════════════════════════
-- `player_intents` is ONE namespace keyed on (user_id, intent_id) and nothing
-- else. Every state-changing RPC in this database claims a row in it and caches
-- its own envelope there. `hr_apply` — and only hr_apply, plus the three market
-- verbs and hr_unlock_buy that copied it — compares the stored `intent` (and the
-- stored `slot`) before serving that cache back:
--
--     if v_prev_intent is distinct from v_this_intent
--        or v_prev_slot is distinct from v_slot then      -- apply-engine §S6
--       … return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
--
-- Twelve other SECURITY DEFINER RPCs read the same cache with the same key and
-- DO NOT compare either column:
--
--     select result into v_cached from public.player_intents
--       where user_id = v_uid and intent_id = p_idem;
--     if v_cached is not null then return v_cached; end if;
--
-- So a uuid claimed by ANY verb answers for EVERY verb. Measured shape of the
-- consequence: present a key that `farm_water` already used to `hr_claim_goal`
-- and the claim answers `ok:true` with the watering's envelope, having credited
-- nothing — silently, on the character the player is looking at. That is the
-- exact failure hr_apply's §S6 comment records ("slot 0 gold 500 -> 500 while a
-- control with a fresh key applied"), one namespace over.
--
-- SEVERITY, HONESTLY. P3, and it stays P3:
--   · SELF-ONLY. `user_id` is `auth.uid()`, so a key can only ever collide with
--     the caller's own keys. Nothing crosses to another player's economy.
--   · NOT REACHABLE BY ACCIDENT. Every client site mints a fresh uuid per
--     gesture (crypto.randomUUID), so this needs deliberate reuse.
--   · The worst case is a player burning their OWN claim by reading back their
--     OWN other decision.
-- It is fixed anyway because it is one comparison that hardens twelve verbs at
-- once, and because "the key namespace is shared but only some readers check
-- what claimed a key" is the kind of invariant that is true until someone adds
-- the thirteenth reader.
--
-- ── THE FOUR CLAIM VERBS THE FINDING NAMED, AUDITED ───────────────────────
-- Measured on nezapsylztqbbwuwembx 2026-08-30 (pg_get_function_identity_arguments):
--     hr_claim_goal(text, boolean, integer, uuid)   ← HAS the gap. Patched here.
--     hr_claim_daily(text, integer)                 ← no p_idem parameter at all
--     hr_claim_rank(text, integer)                  ← no p_idem parameter at all
--     hr_claim_milestone(text, integer)             ← no p_idem parameter at all
--     hr_claim_quest(text, integer)                 ← no p_idem parameter at all
--     hr_claim_bounty(integer)                      ← no p_idem parameter at all
-- Only hr_claim_goal takes an idempotency key, so only hr_claim_goal can serve
-- the wrong cached envelope. The other five are idempotent by a DIFFERENT
-- mechanism — a once-guard on a `player_progress` state transition (claimed) —
-- which is keyed on the reward, not on a client uuid, and therefore cannot be
-- confused between intents. That is not a gap and this file does not touch them.
-- (Whether they SHOULD carry an idempotency key so a lost-on-the-wire success is
-- distinguishable from a failure is a separate question, recorded in §5.)
--
-- ── THE OTHER ELEVEN ──────────────────────────────────────────────────────
-- Found by asking the database rather than by reading the finding: every
-- plpgsql function in `public` whose body mentions player_intents, minus the
-- five that already compare (hr_apply, hr_market_list/cancel/buy, hr_unlock_buy)
-- and hr_intents_prune (which reads no cache). CLAUDE.md rule 3 — kill the
-- class, not the bug.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE FIX — one helper, twelve two-line call sites
-- ══════════════════════════════════════════════════════════════════════════
-- §1 creates `hr_intent_replay(uid, slot, idem, intent)`, which answers:
--     NULL                          no key, no row, or a row with no result
--                                   → the caller proceeds exactly as before
--     the cached envelope           the row was claimed for THIS intent+slot
--     {ok:false,error:'intent_mismatch'}   it was claimed for something else
--
-- §2 replaces each site's two-line cache read with:
--     select public.hr_intent_replay(v_uid, <slot>, p_idem, <intent>) into v_x;
--     if v_x ->> 'error' = 'intent_mismatch' then return v_x; end if;
-- and leaves the caller's EXISTING `if v_x is not null then return …` line
-- standing, untouched — including the FOUR sites that append
-- `|| jsonb_build_object('replayed', true)` (hr_bounty_spend__ungated,
-- hr_put_client_state__ungated, hr_set_style__ungated, hr_trait_buy__ungated),
-- which the early return above keeps off the mismatch envelope: a refusal must
-- never be labelled a replay.
--
-- WHY A HELPER AND NOT TWELVE INLINE COMPARISONS. The comparison needs the
-- stored `intent` and the stored `slot`, i.e. two more local variables in each
-- body — and a programmatic patcher that has to inject `declare` entries into
-- twelve differently-shaped headers is a patcher that will get one wrong. One
-- function-call expression fits where the `select` already was, needs no new
-- variable, and puts the RULE in one auditable place instead of twelve copies
-- that agree today.
--
-- ⚠ THE INTENT LABEL PASSED AT EACH SITE IS THE EXPRESSION THAT SITE ALREADY
--   WRITES when it claims the row (verified body by body, §2's table) — not a
--   new string. Nothing about which key belongs to which verb changes; the
--   column simply stops being write-only. That is what makes this safe to apply
--   with rows already in the table: every live row was written with the same
--   expression the read now compares against.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ══════════════════════════════════════════════════════════════════════════
-- 1. It does not change any WRITTEN label. `hr_claim_goal` files every goal
--    claim under the label `goal_claim`, so reusing one uuid for goal A and then
--    goal B still replays A's envelope. That residual is INTRA-verb, self-only,
--    and strictly smaller than the cross-verb hole this closes. Making the label
--    `goal_claim:<goal_id>` is the tighter fix and it is NOT taken here on
--    purpose: changing a written label means a retry that crosses the deploy
--    boundary sees `intent_mismatch` for a claim that actually succeeded, which
--    trades a self-only confusion for a player-visible refusal.
--    ⏳ THE TRIGGER IS THE WIPE, and it is a scheduled debt rather than a
--    someday: at cutover `player_intents` is EMPTY, so the deploy-window
--    objection above evaporates entirely — there is no in-flight retry to
--    refuse. It also ends a real inconsistency, because three of the twelve
--    (`set_style:<family>:<key>`, `trait_buy:<id>`, `bank_<dir>`) ALREADY carry
--    a discriminator, so the label vocabulary is half-migrated today. Do it in
--    the wipe window, all twelve at once, or not at all.
-- 2. It does not reclassify `intent_mismatch` as an INCIDENT in
--    hr_record_rejection's `c_incident` array. It arguably belongs there (an
--    honest client mints a fresh uuid per gesture, so reuse is anomalous by
--    construction), but that array is shared with hr_apply and the severity
--    taxonomy is the Security Engineer's; recorded as a recommendation.
-- 3. It does not add a `p_idem` to the five claim verbs that lack one (§5).
--
-- ══════════════════════════════════════════════════════════════════════════
-- REVERSIBILITY
-- ══════════════════════════════════════════════════════════════════════════
-- Fully reversible, and the reverse is mechanical: re-apply the migration that
-- last authored each body (they are named in §2's table), which restores the
-- unguarded read, then `drop function public.hr_intent_replay(uuid,int,uuid,text)`.
-- No table is created, no column added, no row written, no grant changed. The
-- only durable effect is twelve function bodies and one new privileged function
-- that no role can execute.
--
-- ══════════════════════════════════════════════════════════════════════════
-- COST
-- ══════════════════════════════════════════════════════════════════════════
-- The patched read is the SAME single primary-key lookup on player_intents it
-- replaced (`select * into` a rowtype instead of `select result into` a jsonb),
-- now inside a function call. No extra query, no extra row, no extra byte
-- stored. At 100× players the only new write is one `hr_rejections` upsert per
-- mismatch — and a mismatch is, by construction, a thing an honest client cannot
-- produce (that table is already deduped per user/slot/day/code and pruned by
-- `hr-rejections-prune`).
-- ══════════════════════════════════════════════════════════════════════════


-- ── §0. FAIL CLOSED ────────────────────────────────────────────────────────
-- Every precondition is a fact about the LIVE database, not about the file
-- order: this file patches whatever is installed, so it must refuse to run
-- against a database where any of it is missing rather than half-harden.
do $$
declare
  v_missing text[] := '{}';
  s text;
begin
  if to_regclass('public.player_intents') is null then
    raise exception 'player_intents is absent — apply 2026-08-11-apply-engine.sql first.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'player_intents'
                    and column_name = 'intent') then
    raise exception 'player_intents.intent is absent — there is nothing to compare against, '
                    'so this hardening would be a no-op that reads as shipped.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'player_intents'
                    and column_name = 'slot') then
    raise exception 'player_intents.slot is absent — the slot half of the comparison '
                    '(hr_apply §S6, the slot-0/slot-1 replay) cannot be made.';
  end if;
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'hr_record_rejection is absent — a refusal this file introduces would be '
                    'invisible. Apply 2026-08-11-apply-engine.sql first.';
  end if;

  foreach s in array array[
    'public.hr_bank_move(int,text,bigint,text,uuid)',
    'public.hr_bounty_spend__ungated(int,text,int,bigint,uuid)',
    'public.hr_claim_goal__ungated(text,boolean,int,uuid)',
    'public.hr_farm_harvest(int,int,uuid)',
    'public.hr_farm_plant(int,int,text,uuid)',
    'public.hr_farm_upgrade_plot(int,uuid)',
    'public.hr_farm_water(int,int,uuid)',
    'public.hr_put_client_state__ungated(int,jsonb,uuid)',
    'public.hr_set_style__ungated(text,text,int,uuid)',
    'public.hr_trait_buy__ungated(text,int,uuid)',
    'public.hr_worker_assign(int,text,text,text,uuid)',
    'public.hr_worker_hire(int,uuid)']
  loop
    if to_regprocedure(s) is null then v_missing := v_missing || s; end if;
  end loop;
  if array_length(v_missing, 1) is not null then
    raise exception 'these idempotent RPCs are absent, so this file cannot harden them: %. '
                    'Apply the migrations that create them first (see §2).', array_to_string(v_missing, ', ');
  end if;
end $$;


-- ── §1. THE HELPER — the one place the replay rule is written ──────────────
-- SECURITY INVOKER, ON PURPOSE. It takes a uuid as an ARGUMENT, so as a
-- DEFINER function reachable by any client role it would be "read any player's
-- intent cache". As an INVOKER function it runs with the privileges of whoever
-- is executing — which, called from inside the twelve SECURITY DEFINER bodies,
-- is those functions' owner, exactly as the inline `select` it replaces was.
-- Belt and braces: §1b revokes EXECUTE from every role, so no client can reach
-- it directly at all.
--
-- VOLATILE (not STABLE): the mismatch path WRITES an hr_rejections row through
-- hr_record_rejection, and a STABLE function may not write.
--
-- THREE ANSWERS, and the null one is load-bearing:
--   NULL  → "no cached decision" → the caller does its work, exactly as before.
--           This covers p_idem IS NULL (several of these RPCs accept a null key
--           and simply do not dedupe), no row, and a row whose `result` is null.
--           The last case preserves TODAY's behaviour byte for byte rather than
--           inventing an `intent_in_flight` verdict for a state these twelve
--           bodies cannot produce: each writes its row ONCE, at the end, with
--           the finished envelope (measured on production 2026-08-30:
--           0 of 2,065 rows have a null result, 0 have a null intent).
create or replace function public.hr_intent_replay(
  p_uid    uuid,
  p_slot   int,
  p_idem   uuid,
  p_intent text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $fn$
declare
  v_row public.player_intents%rowtype;
begin
  if p_uid is null or p_idem is null then return null; end if;

  select * into v_row from public.player_intents
   where user_id = p_uid and intent_id = p_idem;
  if not found then return null; end if;

  -- THE COMPARISON hr_apply has carried since 2026-08-15 (apply-engine §S6),
  -- both halves of it. A stored NULL intent is treated as a MATCH: it can only
  -- come from a writer that predates the column being populated, and
  -- fabricating a mismatch out of missing data would refuse a legitimate retry.
  -- A null p_slot (the caller did not offer one) skips the slot half rather than
  -- comparing against nothing.
  if (v_row.intent is not null and v_row.intent is distinct from p_intent)
     or (p_slot is not null and v_row.slot is distinct from p_slot) then
    perform public.hr_record_rejection(
      p_uid, coalesce(p_slot, v_row.slot), coalesce(p_intent, 'intent'), 'intent_mismatch',
      jsonb_build_object('stored', v_row.intent, 'sent', p_intent,
                         'stored_slot', v_row.slot, 'sent_slot', p_slot), 1);
    -- The MACHINE CODE ONLY, exactly as hr_apply answers it. The rejection row
    -- carries the detail; the envelope must not tell a caller which other verb
    -- holds their key (it is self-only information, but a refusal is not a
    -- lookup service).
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'intent_mismatch');
  end if;

  return v_row.result;   -- may be NULL; see the header — NULL means "proceed"
end;
$fn$;

-- ── §1b. NOBODY MAY CALL IT ───────────────────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC on every new function and Supabase's
-- default ACL adds anon/authenticated/service_role on top. This function is an
-- internal of twelve SECURITY DEFINER bodies and is reachable from them WITHOUT
-- any grant (a definer function's own privileges are what count), so the correct
-- ACL is the empty one.
revoke execute on function public.hr_intent_replay(uuid, int, uuid, text) from public;
revoke execute on function public.hr_intent_replay(uuid, int, uuid, text) from anon, authenticated, service_role;


-- ── §2. THE TWELVE CALL SITES ─────────────────────────────────────────────
-- PROGRAMMATIC, ANCHORED, FAIL-CLOSED, IDEMPOTENT. Never restate a body this
-- file did not author (the gold_500 drift rule): a template restatement is how
-- the b484–b487 "everything refuses" wave happened.
--
--   function                         var        slot     intent expression        last authored by
--   hr_bank_move                     v_cached   p_slot   'bank_' || p_dir         2026-08-27-bank-store.sql
--   hr_bounty_spend__ungated         v_prev     v_slot   v_intent                 2026-08-23-bounty.sql
--   hr_claim_goal__ungated           v_cached   v_slot   'goal_claim'             2026-08-23-modal-goal-claims.sql
--   hr_farm_harvest                  v_cached   p_slot   'farm_harvest'           2026-08-22-server-farming-complete.sql
--   hr_farm_plant                    v_cached   p_slot   'farm_plant'             2026-08-23-modal-goal-claims.sql §5
--   hr_farm_upgrade_plot             v_cached   p_slot   'farm_upgrade_plot'      2026-08-22-server-farming-complete.sql
--   hr_farm_water                    v_cached   p_slot   'farm_water'             2026-08-22-server-farming-complete.sql
--   hr_put_client_state__ungated     v_prev     v_slot   'client_state_put'       2026-08-22-client-state-denylist.sql
--   hr_set_style__ungated            v_cached   v_slot   'set_style:'||fam||':'|| 2026-08-24-combat-style.sql
--   hr_trait_buy__ungated            v_cached   v_slot   'trait_buy:'||v_cat.…    2026-08-23-trait-buy.sql
--   hr_worker_assign                 v_cached   p_slot   'worker_assign'          2026-08-25-workers.sql
--   hr_worker_hire                   v_cached   p_slot   'worker_hire'            2026-08-25-workers.sql
--
-- EVERY intent expression above is COPIED FROM THAT BODY'S OWN
-- `insert into player_intents … values (…)` — verified statement by statement on
-- production 2026-08-30 — and every variable it names is assigned BEFORE the
-- cache read (v_uid/v_slot in the declare block; p_* are parameters;
-- v_cat.trait_id is read at hr_trait_buy §1, two blocks above its §3 cache
-- read; v_intent is declare-initialised from p_reason). A label that named a
-- variable not yet assigned would compare against NULL and mismatch every
-- legitimate retry — which is why this table is a table and not a guess.
do $do$
declare
  r record;
  v_src text; v_new text; v_anchor text; v_repl text; v_hits int;
  v_acl_before text; v_acl_after text;
  v_patched int := 0; v_already int := 0;
begin
  for r in
    select * from (values
      ('public.hr_bank_move(int,text,bigint,text,uuid)',         'v_cached', '  ', 'p_slot', $lbl$'bank_' || p_dir$lbl$),
      ('public.hr_bounty_spend__ungated(int,text,int,bigint,uuid)','v_prev', '  ', 'v_slot', $lbl$v_intent$lbl$),
      ('public.hr_claim_goal__ungated(text,boolean,int,uuid)',   'v_cached', '    ', 'v_slot', $lbl$'goal_claim'$lbl$),
      ('public.hr_farm_harvest(int,int,uuid)',                   'v_cached', '  ', 'p_slot', $lbl$'farm_harvest'$lbl$),
      ('public.hr_farm_plant(int,int,text,uuid)',                'v_cached', '  ', 'p_slot', $lbl$'farm_plant'$lbl$),
      ('public.hr_farm_upgrade_plot(int,uuid)',                  'v_cached', '  ', 'p_slot', $lbl$'farm_upgrade_plot'$lbl$),
      ('public.hr_farm_water(int,int,uuid)',                     'v_cached', '  ', 'p_slot', $lbl$'farm_water'$lbl$),
      ('public.hr_put_client_state__ungated(int,jsonb,uuid)',    'v_prev',   '  ', 'v_slot', $lbl$'client_state_put'$lbl$),
      ('public.hr_set_style__ungated(text,text,int,uuid)',       'v_cached', '    ', 'v_slot', $lbl$'set_style:' || p_family || ':' || p_key$lbl$),
      ('public.hr_trait_buy__ungated(text,int,uuid)',            'v_cached', '    ', 'v_slot', $lbl$'trait_buy:' || v_cat.trait_id$lbl$),
      ('public.hr_worker_assign(int,text,text,text,uuid)',       'v_cached', '  ', 'p_slot', $lbl$'worker_assign'$lbl$),
      ('public.hr_worker_hire(int,uuid)',                        'v_cached', '  ', 'p_slot', $lbl$'worker_hire'$lbl$)
    ) as t(sig, var, ind, slot, label)
  loop
    -- CR-TOLERANT. A body applied from a CRLF working copy is STORED with CRLF,
    -- and an LF-joined anchor would then match nothing at all — the trap
    -- 2026-08-23-modal-goal-claims.sql §5 documents. Stripping CR is also the
    -- only normalisation done here: none of these twelve is on a derivation
    -- chain, so no guard compares their bytes against a predecessor.
    v_src := replace(pg_get_functiondef(r.sig::regprocedure), chr(13), '');

    if position('hr_intent_replay(' in v_src) > 0 then
      v_already := v_already + 1;
      raise notice '% already carries the intent guard — patch skipped', r.sig;
      continue;
    end if;

    v_anchor := r.ind || 'select result into ' || r.var || ' from public.player_intents' || chr(10)
             || r.ind || '  where user_id = v_uid and intent_id = p_idem;';
    v_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    if v_hits <> 1 then
      raise exception 'ANCHOR DRIFT on %: the unguarded cache read matched % times, expected exactly 1. '
                      'Refusing to patch blind. Re-apply the migration that last authored this body '
                      '(see the table in §2 of this file), then re-apply this one.', r.sig, v_hits;
    end if;

    v_repl :=
         r.ind || '-- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY.' || chr(10)
      || r.ind || '-- player_intents is ONE namespace for every verb in this database, so a key' || chr(10)
      || r.ind || '-- claimed by another intent (or the same intent on another slot) must be' || chr(10)
      || r.ind || '-- REFUSED, not answered with that intent''s decision. Same comparison hr_apply' || chr(10)
      || r.ind || '-- has carried since apply-engine §S6; the helper is the one copy of the rule.' || chr(10)
      || r.ind || '-- A NULL answer means "no cached decision" and the body proceeds as before.' || chr(10)
      || r.ind || 'select public.hr_intent_replay(v_uid, ' || r.slot || ', p_idem, ' || r.label || ') into ' || r.var || ';' || chr(10)
      || r.ind || 'if ' || r.var || ' ->> ''error'' = ''intent_mismatch'' then return ' || r.var || '; end if;';

    v_new := replace(v_src, v_anchor, v_repl);

    -- THE ACL IS THE POINT OF THE WHOLE PROGRAM, so prove the replace did not
    -- move it. `create or replace` preserves proacl — this asserts that rather
    -- than trusting it, and it is cheaper than restating twelve revoke/grant
    -- blocks (a restatement is itself a chance to widen one).
    select coalesce(proacl::text, '') into v_acl_before from pg_proc where oid = r.sig::regprocedure;
    execute v_new;
    select coalesce(proacl::text, '') into v_acl_after  from pg_proc where oid = r.sig::regprocedure;
    if v_acl_after is distinct from v_acl_before then
      raise exception 'ACL MOVED on % (% -> %) — a body replace must never change who may call it.',
        r.sig, v_acl_before, v_acl_after;
    end if;

    v_patched := v_patched + 1;
    raise notice 'patched %: idempotency now compares intent + slot', r.sig;
  end loop;

  if v_patched + v_already <> 12 then
    raise exception 'expected 12 call sites, handled % (patched %, already guarded %)',
      v_patched + v_already, v_patched, v_already;
  end if;
  raise notice 'intent-mismatch class: % patched, % already guarded', v_patched, v_already;
end $do$;


-- ── §3. SELF-VERIFICATION — the load-bearing properties, asserted ──────────
-- A migration that does not check its own claims is a comment.
do $do$
declare
  s text; v_src text; v_bad text[] := '{}'; v_open text[] := '{}';
  v_acl aclitem[];
begin
  foreach s in array array[
    'public.hr_bank_move(int,text,bigint,text,uuid)',
    'public.hr_bounty_spend__ungated(int,text,int,bigint,uuid)',
    'public.hr_claim_goal__ungated(text,boolean,int,uuid)',
    'public.hr_farm_harvest(int,int,uuid)',
    'public.hr_farm_plant(int,int,text,uuid)',
    'public.hr_farm_upgrade_plot(int,uuid)',
    'public.hr_farm_water(int,int,uuid)',
    'public.hr_put_client_state__ungated(int,jsonb,uuid)',
    'public.hr_set_style__ungated(text,text,int,uuid)',
    'public.hr_trait_buy__ungated(text,int,uuid)',
    'public.hr_worker_assign(int,text,text,text,uuid)',
    'public.hr_worker_hire(int,uuid)']
  loop
    v_src := replace(pg_get_functiondef(s::regprocedure), chr(13), '');
    -- (a) THE GUARD IS THERE, exactly once.
    if (length(v_src) - length(replace(v_src, 'hr_intent_replay(', ''))) / length('hr_intent_replay(') <> 1 then
      v_bad := v_bad || s;
    end if;
    -- (b) AND NO DIRECT READ OF THE TABLE SURVIVES. (a) without (b) would pass
    -- on a body that reads the cache twice, once through the helper and once
    -- straight. `insert INTO public.player_intents` (the write) does not match
    -- this pattern, which is the point of anchoring on `from`.
    if position('from public.player_intents' in v_src) > 0 then
      v_open := v_open || s;
    end if;
  end loop;
  if array_length(v_bad, 1) is not null then
    raise exception 'these bodies do not carry exactly one hr_intent_replay call: %',
      array_to_string(v_bad, ', ');
  end if;
  if array_length(v_open, 1) is not null then
    raise exception 'these bodies still read player_intents.result without comparing intent: %',
      array_to_string(v_open, ', ');
  end if;

  -- (c) THE HELPER REACHES NO CLIENT. Three independent readings, because a
  --     grant can hide in any of them.
  if has_function_privilege('anon', 'public.hr_intent_replay(uuid,int,uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_intent_replay(uuid,int,uuid,text)', 'execute')
     or has_function_privilege('service_role', 'public.hr_intent_replay(uuid,int,uuid,text)', 'execute') then
    raise exception 'hr_intent_replay is executable by a client role — it takes a uuid as an '
                    'ARGUMENT, so that is "read any player''s intent cache".';
  end if;
  -- And the PUBLIC pseudo-role, which `has_function_privilege` cannot be asked
  -- about by name. A NULL proacl is the DEFAULT acl — i.e. PUBLIC=EXECUTE — so
  -- "no acl" is the failure, not the pass.
  select proacl into v_acl from pg_proc
   where oid = 'public.hr_intent_replay(uuid,int,uuid,text)'::regprocedure;
  if v_acl is null then
    raise exception 'hr_intent_replay carries the DEFAULT acl, which grants EXECUTE to PUBLIC — '
                    'the revoke in §1b did not take.';
  end if;
  if exists (select 1 from aclexplode(v_acl) a where a.grantee = 0) then
    raise exception 'hr_intent_replay still carries a PUBLIC execute grant (acl %)', v_acl::text;
  end if;
  if exists (select 1 from pg_proc p
              where p.oid = 'public.hr_intent_replay(uuid,int,uuid,text)'::regprocedure
                and p.prosecdef) then
    raise exception 'hr_intent_replay must be SECURITY INVOKER — as a DEFINER function taking a '
                    'uuid argument it would be an intent-cache read oracle.';
  end if;

  raise notice 'intent-mismatch class: 12/12 guarded, helper unreachable, ACLs unchanged';
end $do$;


-- ── §4. RECORDED, NOT BUILT ───────────────────────────────────────────────
-- (i) FIVE CLAIM VERBS TAKE NO IDEMPOTENCY KEY: hr_claim_daily, hr_claim_rank,
--     hr_claim_milestone, hr_claim_quest, hr_claim_bounty. Their once-guard (a
--     player_progress state transition to 'claimed') makes a double PAYOUT
--     impossible, which is the property that matters, so this is not a hole.
--     What they cannot do is tell a client whose success response was lost on
--     the wire "you already have this" as distinct from "that failed" — the same
--     argument §2a-iv of docs/design/server-authority.md makes for
--     hr_create_character's `created` flag. If that becomes player-visible
--     (a retry showing "already claimed" as an error), the fix is a `created`-
--     style receipt, not a uuid.
-- (ii) INTRA-VERB KEY REUSE survives for the verbs whose label carries no
--     discriminator (goal_claim, farm_*, worker_*, client_state_put). Self-only,
--     and its retirement is scheduled for the WIPE — see "WHAT THIS DELIBERATELY
--     DOES NOT DO" (1) for why that window and not this change.
-- (iii) `intent_mismatch` SEVERITY. Not touched by this file (see (2)), and
--     BUILT BY ITS SIBLING: 2026-09-03-intent-mismatch-escalates.sql adds it to
--     hr_record_rejection's `c_escalating` array — Security's ruling, and the
--     right one: a single mismatch is a stale retry, sustained mismatches are a
--     signature an honest client cannot produce. That is the `rate_limited`
--     profile, not the `c_incident` profile (which fires on the FIRST
--     occurrence). Applying THIS file without that one leaves the detector
--     recording every mismatch at severity 'normal' forever, at any n.
-- (iv) NOT THIS FILE'S PROBLEM, RECORDED SO IT IS NOT LOST (Security F5, raised
--     during this review as PRE-EXISTING and separately tracked): the
--     anon-callable `beta_invite_check` enumeration oracle, and the
--     `market_price_history` SECURITY DEFINER view. Neither is touched here and
--     neither should be fixed in a file about idempotency keys — a security fix
--     smuggled into an unrelated migration is one nobody reviews.


-- ── §5. THE DATABASE-SIDE DETECTOR, re-run strict ─────────────────────────
-- Guarded so a database without it still applies this file. LAST, because the
-- migration guard in tests/run-smoke.mjs requires every migration to END on a
-- real SQL terminator — a file whose last line is prose is indistinguishable
-- from a file that was truncated.
do $$
begin
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    perform public.hr_assert_grant_hygiene(true);
    raise notice 'hr_assert_grant_hygiene(strict) passed after the patch';
  end if;
end $$;
