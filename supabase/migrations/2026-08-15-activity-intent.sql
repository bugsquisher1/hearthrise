-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE ACTIVITY INTENT, SERVER HALF  (b345)
--
-- ⚠ REVIEW ONLY — STAGED, NOT APPLIED. The Coordinator applies.
--
-- Companion design: docs/design/server-authority.md §2 ("the intent protocol"),
-- §3 ("the accrual engine"). Companion code: supabase/functions/hr-accrue/
-- {intents,set-activity,request}.js. Companion test: tests/activity-intent.mjs.
--
-- ── WHAT THIS FILE IS, AND WHY IT IS SO SMALL ───────────────────────────
-- The first player intent — "I am now fighting goblins" / "I stopped" — is
-- almost entirely NOT SQL, and that is the architecture working rather than a
-- gap. The rules it needs (what a night of that activity is worth) are the
-- game's rules, they are already JavaScript in src/core/** and src/data/**, and
-- they are vendored into the Edge Function at deploy time. Re-expressing 31
-- monsters and 426 items in PL/pgSQL would be a second copy of the game, and a
-- second copy drifts — that failure has already happened here.
--
-- Everything the DATABASE owns for this intent ALREADY EXISTS and is live:
--   · `hr_activities` — the generated catalogue (344 rows) hr_apply validates
--     the declaration against, so a forged activity id is refused by data that
--     came out of src/data/*.js rather than by a hand-written list;
--   · hr_apply's ACTIVITY block — kind/id pairing, catalogue lookup, and the
--     skill gate RE-CHECKED against SERVER xp (apply-engine.sql §R11);
--   · hr_apply's S5 stamp — `accrued_to = now()` on any delta carrying
--     `activity` or `equip`;
--   · `player_intents` + `intent_mismatch` — idempotency and the collision
--     refusal that makes a CLIENT-CHOSEN key safe.
--
-- So the only thing missing in Postgres is a rate budget for the new verb.
-- One `create or replace`. That is the whole SQL delta, and a file this size is
-- the evidence the seam was drawn in the right place.
--
-- ── THE LIMIT, AND WHY THIS NUMBER ──────────────────────────────────────
-- 30 set_activity attempts per minute per user, matching `accrue`. The verb
-- does strictly MORE work than an accrual (a collect apply AND a switch apply,
-- against accrue's one), so its budget must not be looser than accrue's. A
-- player switching activity thirty times a minute is not a player.
--
-- Note the two buckets are independent counters, so a client can spend both:
-- 60 engine calls/minute/user total. Stated rather than discovered. The
-- expensive half is bounded elsewhere anyway — ACCRUE_MIN_MS is 60,000, so a
-- collect can PRODUCE something at most once a minute no matter which verb asks.
--
-- ── FAIL CLOSED ON A STALE hr_apply — READ THIS BEFORE APPLYING ─────────
-- §0 refuses to install against an hr_apply that lacks EITHER
-- `intent_mismatch` OR the S5 stamp, and it is not being cautious:
--
--   · WITHOUT `intent_mismatch`, giving the client an intent id makes S6 live.
--     `player_intents` is one namespace shared with the server-derived accrual
--     keys; a replay that is not a replay of the same thing hands back somebody
--     else's decision. Today the namespace has one producer (the accrual
--     engine, salted); this file is what adds a second, CLIENT-CHOSEN producer.
--   · WITHOUT the S5 stamp, an activity change does not close the window, and
--     the 12.8x-gold / 20x-XP equip-at-collect over-payment measured on
--     2026-08-11 becomes reachable the moment a client can start an activity.
--
-- Both are present in production as of 2026-08-14 (apply-engine applied). The
-- check exists so that a REPLAY of the migration set onto a fresh database, in
-- the wrong order, refuses instead of installing a half-safe intent surface.
--
-- SAFE TO RE-RUN. Additive and idempotent: one `create or replace function`,
-- one revoke/grant pair, and self-checks that clean up after themselves.
-- REVERSIBLE: re-apply 2026-08-11-accrue-gate.sql to restore the previous body
-- verbatim (it is `create or replace` on the same signature). Nothing else in
-- this file creates a table, a column, a row, an index or a cron entry.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions — FAIL CLOSED ───────────────────────────────────────
do $$
declare v_src text; v_ctl boolean;
begin
  if to_regprocedure('public.hr_rate_gate(uuid,int,text)') is null then
    raise exception 'hr_rate_gate missing — apply 2026-08-11-accrue-gate.sql first';
  end if;
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply missing — apply 2026-08-11-apply-engine.sql first';
  end if;
  if to_regclass('public.hr_activities') is null then
    raise exception 'hr_activities missing — apply 2026-08-11-catalogue.generated.sql first';
  end if;
  if (select count(*) from public.hr_activities) = 0 then
    raise exception 'hr_activities is EMPTY — every declaration would be refused as unknown_activity';
  end if;
  if not exists (select 1 from public.hr_activities where kind = 'combat') then
    raise exception 'hr_activities holds no combat rows — the only kind this intent can set today';
  end if;

  -- THE TWO PROPERTIES OF hr_apply THIS INTENT SURFACE DEPENDS ON.
  --
  -- ⚠ A prosrc scan is a text search, and a text search that has silently
  --   stopped matching passes forever. So it carries a CONTROL: a term that
  --   MUST be in any hr_apply worth the name. If the control is not found, the
  --   scan is blind and this file refuses rather than reporting a clean bill of
  --   health on a database it cannot read. (Instance #13's lesson, applied
  --   before the fact rather than after.)
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';
  v_ctl := v_src ~ 'version_conflict';
  if not v_ctl then
    raise exception 'THE hr_apply SOURCE SCAN IS BLIND — the control term (version_conflict) is '
                    'absent from a % char body, so the two checks below would pass on any '
                    'database. Fix the scan, do not loosen it.', coalesce(length(v_src), 0);
  end if;
  if v_src !~ 'intent_mismatch' then
    raise exception 'hr_apply has NO intent_mismatch BRANCH. This file adds a CLIENT-CHOSEN '
                    'intent-id producer to a namespace shared with the server-derived accrual '
                    'keys; without that branch a key collision hands back another intent''s '
                    'decision (review S6). Apply 2026-08-11-apply-engine.sql first.';
  end if;
  if v_src !~ 'p_delta \? ''equip'' or p_delta \? ''activity''' then
    raise exception 'hr_apply does NOT stamp accrued_to on an activity change (review S5). '
                    'Without it a client-reachable activity intent reopens the 12.8x-gold / '
                    '20x-XP equip-at-collect over-payment. Apply 2026-08-11-apply-engine.sql first.';
  end if;
end $$;

-- ── 1. hr_rate_gate — one bucket added ───────────────────────────────────
-- Unchanged from 2026-08-11-accrue-gate.sql except for the `activity` arm. The
-- whole body is restated rather than patched because `create or replace` is the
-- only way to change it and a diff-shaped migration does not exist in SQL; read
-- the original file's header for why the limit lives here instead of being an
-- argument (a caller that names its own rate limit does not have one).
create or replace function public.hr_rate_gate(p_user uuid, p_slot int, p_bucket text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_limit  int;
  v_window interval;
  v_weight bigint;
begin
  if p_user is null then return false; end if;

  -- THE ALLOWLIST AND THE LIMITS. Server-owned, both of them. An unknown bucket
  -- is refused rather than defaulted: a typo in a caller must not silently
  -- create a brand-new, unlimited counter namespace.
  case p_bucket
    when 'accrue'   then v_limit := 30; v_window := interval '1 minute';
    -- b345. Matches `accrue` deliberately: set_activity runs a COLLECT apply
    -- and a SWITCH apply, so it is strictly more expensive per call and must
    -- not be the looser budget of the two.
    when 'activity' then v_limit := 30; v_window := interval '1 minute';
    else return false;
  end case;

  if public.hr_rate_ok(p_user, p_bucket, v_limit, v_window) then
    return true;
  end if;

  -- Sampled record. Same policy as hr_load and hr_apply: detection does not need
  -- every event, it needs to know the event is happening and roughly how much.
  v_weight := public.hr_rate_sample_weight(public.hr_rate_over(p_user, p_bucket) - v_limit);
  if v_weight > 0 then
    perform public.hr_record_rejection(p_user, coalesce(p_slot, 0), p_bucket, 'rate_limited',
      jsonb_build_object('limit', v_limit, 'per', v_window::text, 'gate', true), v_weight);
  end if;
  return false;
end $$;

-- ── 2. GRANTS — revoke from PUBLIC first, then grant ─────────────────────
-- `create or replace` preserves the existing ACL, so these are belt-and-braces.
-- They are here because Supabase's default ACL grants EXECUTE to PUBLIC on every
-- new function and "it was already correct" is how a gap survives three reviews.
revoke execute on function public.hr_rate_gate(uuid, int, text) from public;
revoke execute on function public.hr_rate_gate(uuid, int, text)
  from anon, authenticated, service_role;
grant execute on function public.hr_rate_gate(uuid, int, text) to hr_engine;

-- ── 3. SELF-VERIFICATION — BEHAVIOURAL, EXECUTED, WITH CONTROLS ──────────
-- Every refusal probe below is paired with a control that fails if the probe is
-- blind. A migration whose self-check can only ever pass has checked nothing.
do $$
declare
  v_p    oid;
  v_bad  text;
  v_u    uuid := gen_random_uuid();
  v_n    int  := 0;
  i      int;
begin
  v_p := to_regprocedure('public.hr_rate_gate(uuid,int,text)');

  -- (A) CAPABILITY. Engine-only. The gate decides whether an expensive read
  --     happens at all; a client that could call it could exhaust another
  --     player's budget.
  select string_agg(r, ', ') into v_bad
    from unnest(array['public','anon','authenticated','service_role']) r
   where has_function_privilege(r, v_p, 'execute');
  if v_bad is not null then
    raise exception 'hr_rate_gate is executable by: % — revoke before grant', v_bad;
  end if;
  if not has_function_privilege('hr_engine', v_p, 'execute') then
    raise exception 'hr_engine cannot execute hr_rate_gate — the intent path would be ungated';
  end if;

  -- (B) hr_rate_ok STAYS unreachable by everyone, hr_engine included. If the
  --     engine could call it, the engine would name its own limit and both
  --     buckets above become decoration.
  select string_agg(r, ', ') into v_bad
    from unnest(array['public','anon','authenticated','service_role','hr_engine']) r
   where has_function_privilege(r, 'public.hr_rate_ok(uuid,text,int,interval)', 'execute');
  if v_bad is not null then
    raise exception 'hr_rate_ok is executable by: % — the limit would become a caller argument', v_bad;
  end if;

  -- (C) THE NEW BUCKET WORKS, AND THE OLD ONE STILL DOES.
  --     A random uuid has no counter row, so this is a self-contained fixture.
  if public.hr_rate_gate(v_u, 0, 'not_a_bucket') then
    raise exception 'hr_rate_gate admitted an unknown bucket — it must fail closed';
  end if;
  if not public.hr_rate_gate(v_u, 0, 'activity') then
    raise exception 'hr_rate_gate refused the first activity call';
  end if;
  -- REGRESSION CONTROL: this file rewrites the whole body, so the pre-existing
  -- bucket is exactly the thing a careless edit would drop.
  if not public.hr_rate_gate(v_u, 0, 'accrue') then
    raise exception 'hr_rate_gate refused an accrue call — this rewrite dropped the accrual budget';
  end if;

  -- (D) THE LIMIT IS APPLIED, and it is per-bucket rather than shared.
  for i in 1..40 loop
    if public.hr_rate_gate(v_u, 0, 'activity') then v_n := v_n + 1; end if;
  end loop;
  if v_n >= 40 then
    raise exception 'hr_rate_gate allowed % of 40 further activity calls — the limit is not applied', v_n;
  end if;
  -- ...and exhausting `activity` must not have exhausted `accrue`. Two budgets,
  -- two counters: if this fires, one bucket is starving the other.
  if not public.hr_rate_gate(v_u, 0, 'accrue') then
    raise exception 'exhausting the activity bucket also exhausted accrue — the counters are shared';
  end if;
  if public.hr_rate_gate(null, 0, 'activity') then
    raise exception 'hr_rate_gate admitted a null user on the activity bucket';
  end if;

  delete from public.hr_rate_counters where user_id = v_u;
  delete from public.hr_rejections where user_id = v_u;

  raise notice 'hr_rate_gate: activity = 30/min added, accrue = 30/min intact, unknown buckets fail closed.';
end $$;

-- ── 4. THE HAZARD THIS INTENT SURFACE EXISTS TO HANDLE ───────────────────
-- Proven by EXECUTION against a real character, inside a subtransaction that is
-- rolled back to nothing.
--
-- The assertion is not that hr_apply is wrong — it is right, and deliberately
-- so (review S5). The assertion is that A BARE ACTIVITY SWITCH CONFISCATES THE
-- ELAPSED WINDOW, which is the fact that makes "an intent must COLLECT BEFORE
-- IT SWITCHES" load-bearing rather than a style preference. Written down here,
-- as an executable claim, so that:
--
--   · a reviewer of supabase/functions/hr-accrue/set-activity.js can see WHY
--     the collect is not an optimisation;
--   · the day someone changes hr_apply to stop stamping, THIS file stops
--     applying — instead of the Edge Function quietly doing an unnecessary
--     round trip forever while the over-payment it was avoiding comes back.
--
-- It is skipped, loudly, if the fixtures it needs are unavailable — but never
-- skipped silently, because a self-check that switches itself off is worse than
-- no self-check. (apply-engine §6(g) is the precedent: its guard predicate was
-- MEASURED before the apply so "the gate passed" could be told apart from "the
-- gate was switched off".)
do $$
declare
  v_uid   uuid := gen_random_uuid();
  v_slot  int  := 0;
  v_r     jsonb;
  v_before timestamptz;
  v_after  timestamptz;
  v_gold  bigint;
  v_ver   bigint;
  v_free  int;
begin
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'hr_create_character missing — apply 2026-08-14-character-bootstrap.sql first';
  end if;
  -- MEASURED, not assumed: without a start kit the bootstrap refuses and the
  -- whole block below would "pass" by never running.
  select count(*) into v_free from public.hr_start_kit;
  if v_free <> 1 then
    raise exception '§4 CANNOT RUN: hr_start_kit holds % rows — re-apply the catalogue', v_free;
  end if;

  begin  -- ── SUBTRANSACTION ──────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    if auth.uid() is distinct from v_uid then
      raise exception '§4 HARNESS: auth.uid() did not pick up the probe identity';
    end if;

    v_r := public.hr_create_character(v_slot);
    if v_r->>'created' <> 'true' then
      raise exception '§4: could not create the probe character: %', v_r;
    end if;

    -- Backdate the watermark by an hour: an UNPAID window now exists. Direct
    -- DML as the migration owner — the client holds no UPDATE on this table,
    -- which §3 of 2026-08-14-character-bootstrap.sql asserts.
    update public.player_state
       set accrued_to = now() - interval '1 hour',
           active_kind = 'combat', active_id = 'goblin', active_since = now() - interval '1 hour'
     where user_id = v_uid and slot = v_slot;
    select accrued_to, gold, version into v_before, v_gold, v_ver
      from public.player_state where user_id = v_uid and slot = v_slot;
    if v_before > now() - interval '55 minutes' then
      raise exception '§4 HARNESS: the backdate did not take (accrued_to = %)', v_before;
    end if;

    -- THE BARE SWITCH. No gold, no xp, no items — only the pointer. Called as
    -- the OWNER with p_user = auth.uid(), which is the branch hr_apply allows
    -- for a non-engine caller; `set role hr_engine` is correctly refused on this
    -- database (postgres -> hr_engine is granted WITH SET FALSE).
    v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
             '{"activity":{"kind":"combat","id":"rat","restart":true},
               "journal":{"kind":"admin","intent":"set_activity:combat:rat"}}'::jsonb);
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception '§4 CONTROL: the bare switch was REFUSED (%) — the probe below would '
                      'then prove nothing about confiscation', v_r;
    end if;

    select accrued_to, gold into v_after, v_gold
      from public.player_state where user_id = v_uid and slot = v_slot;

    -- (i) THE WINDOW IS GONE.
    if v_after <= v_before + interval '1 second' then
      raise exception '§4: hr_apply did NOT stamp accrued_to on an activity change (% -> %). '
                      'The S5 over-payment is reachable again and set-activity.js is built on '
                      'the opposite assumption — re-review BOTH halves before proceeding.',
                      v_before, v_after;
    end if;
    -- (ii) AND NOTHING WAS PAID FOR IT. This is the under-payment. It is why
    --      supabase/functions/hr-accrue/set-activity.js runs a COLLECT apply
    --      first and refuses the switch if that collect is rejected.
    if v_gold <> (select gold from public.hr_start_kit) then
      raise exception '§4: the bare switch moved gold (% vs kit %) — this probe is measuring '
                      'something other than a pointer change', v_gold, (select gold from public.hr_start_kit);
    end if;

    raise exception using errcode = 'HR345', message = 'b345 §4 complete — rolling back';
  exception when sqlstate 'HR345' then
    null;
  end;

  -- ROLLBACK PROOF. If the subtransaction had committed, this migration would
  -- have written a character into production as a side effect of verifying itself.
  if exists (select 1 from public.player_state where user_id = v_uid) then
    raise exception '§4 LEAKED a player_state row';
  end if;
  if exists (select 1 from public.player_ledger where user_id = v_uid) then
    raise exception '§4 LEAKED a ledger row';
  end if;
  if exists (select 1 from auth.users where id = v_uid) then
    raise exception '§4 LEAKED the probe auth.users row';
  end if;

  raise notice 'b345 §4 PASSED: a bare activity switch advances accrued_to and pays nothing — '
               'the intent surface MUST collect first, and set-activity.js does.';
end $$;
