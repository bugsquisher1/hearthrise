-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE APPLY ENGINE  (foundation, file 3 of 4)
-- Companion design doc: docs/design/server-authority.md §2, §3
-- Depends on: 2026-08-11-player-state.sql, 2026-08-11-catalogue.generated.sql
--
-- ⚠ REVIEW ONLY — DO NOT APPLY TO PRODUCTION.
--
-- THE PROBLEM THIS SOLVES
--   The simulation (yields, XP, drops, farm growth, combat) has to run in
--   JAVASCRIPT, because that is where the game data already lives and where it
--   is already correct: src/data/{items,gathering,recipes,monsters}.js are pure
--   ESM and import cleanly in Node AND Deno. Re-expressing 400 items, 7 tree
--   rungs, 60+ recipes and 31 monsters in PL/pgSQL would create a second copy
--   of the whole game, and a second copy is a drift generator — that failure
--   has already happened once here (src/main.js's unifyObject header documents
--   the ESM/legacy double-copy that silently split the data).
--
--   But a Deno Edge Function that reads state, computes in JS, then writes back
--   has a read-modify-write race and no transaction around it.
--
-- THE ANSWER — ONE TRANSACTIONAL COMMIT POINT
--   Edge Functions never write tables. They compute a PROPOSED DELTA and hand
--   it to hr_apply(), a single SECURITY DEFINER RPC that, in ONE transaction:
--     1. establishes WHO this is (see "the identity seam" below),
--     2. rate-limits, then serialises the character with an advisory lock,
--     3. short-circuits a replayed intent id,
--     4. refuses a stale `version` (mandatory, not optional),
--     5. RE-VALIDATES every invariant the delta could violate against the
--        GENERATED catalogue: unknown item, unknown skill, unknown activity,
--        illegal equip slot, unmet gear requirement, negative resulting
--        quantity, negative gold, negative gems, bank cap, per-call clamps,
--     6. applies, journals ONE row, bumps the version, returns the new state,
--     7. and — the part revision 1 got wrong — ROLLS BACK ENTIRELY on any
--        rejection.
--
-- ════════════════════════════════════════════════════════════════════════
-- REVISION 2 — the four things the security review found, and the fixes
--
-- S1 · THE IDENTITY SEAM COULD NOT EXECUTE.
--   Revision 1 read auth.uid() and revoked `authenticated`. With the service
--   role, auth.uid() is null → every call returned 'not_signed_in'. With a
--   forwarded player JWT the role is `authenticated` → permission denied.
--   There was no caller that could work.
--
--   Now: hr_apply is executable by exactly one role, `hr_engine`, which holds
--   ZERO table privileges (asserted in file 1). The Edge Function verifies the
--   player's JWT itself and passes the verified id as p_user; hr_apply honours
--   p_user ONLY when the request's role is hr_engine. Any other caller may act
--   only as auth.uid(), and passing someone else's id is a hard rejection.
--   (⚠ the role test reads the `role` GUC, NOT current_user — inside a SECURITY
--   DEFINER function current_user is the owner. Verified on the database.)
--
-- S2 · A REJECTION AFTER A WRITE LEFT THE WRITE BEHIND.
--   Every rejection path after the first DML did `return`, which COMMITS what
--   ran before it. jsonb_each_text has no defined key order, so the delta
--   {items:{plank:+10, log:-10}} could credit the plank, fail on the log, and
--   leave `version` UNBUMPED — so the Edge Function's retry passed the version
--   check and minted the plank again. `bank_full` was worse: it was checked
--   AFTER every item write and then returned.
--
--   Now: there is exactly one write-bearing block, and EVERY rejection inside
--   it raises SQLSTATE 'HR000' with the machine code as the message. The
--   handler rolls the whole block back and formats the envelope. This is the
--   pattern the same author already used correctly at market-v2.sql:288 — it
--   just was not applied consistently.
--
-- S3 · THE CATALOGUE FAILED OPEN.
--   `if to_regclass('public.hr_items') is not null and not exists (…)` meant
--   that on a database where hr_items had not been created — which was every
--   database, because the generator did not exist — the unknown-item check was
--   a silent no-op and ANY STRING WAS A VALID ITEM ID.
--
--   Now: this file refuses to install if the catalogue is absent, and the
--   checks query hr_items unconditionally. tools/gen-catalogues.mjs generates
--   it from src/data/items.js and `--check` fails the build on drift.
--
-- S4 · `equip` VALIDATED NOTHING.
--   The comment claimed "here we only enforce that you own it". The code did
--   not check ownership, the catalogue, the slot, or the requirement, and it
--   never debited the inventory. `{"equip":{"weapon":"dragon_gem"}}` equipped
--   an item the player did not own; equip-then-unequip with a matching
--   `items:{x:+1}` duplicated it.
--
--   Now: the item must exist in hr_items, must be legal for that equip slot
--   per hr_item_slots, must meet its reqSkill/reqLv against SERVER skills, and
--   one unit is MOVED out of player_inventory (and moved back on unequip or
--   swap). Equipping is a transfer, not a flag.
--
-- Also in this revision: mandatory p_version (S9), gem clamp + insufficiency
-- (S5), idempotency keys (S8), progress validation and a separate claim path
-- (S13), read-time accrual watermarks (S19), and revoke-before-grant on every
-- function (S6/S7).
--
-- SAFE TO RE-RUN.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions — FAIL CLOSED ───────────────────────────────────────
-- The catalogue is not optional. A missing catalogue used to disable the
-- allowlists silently; now it stops the migration. An allowlist that no-ops is
-- worse than no allowlist, because it reads as a control in review.
do $$
begin
  if to_regclass('public.player_state') is null then
    raise exception 'run 2026-08-11-player-state.sql first';
  end if;
  if to_regclass('public.hr_items') is null
     or to_regclass('public.hr_equip_slots') is null
     or to_regclass('public.hr_item_slots') is null
     or to_regclass('public.hr_activities') is null then
    raise exception 'catalogue_missing — run: node tools/gen-catalogues.mjs, then apply 2026-08-11-catalogue.generated.sql';
  end if;
  if (select count(*) from public.hr_items) = 0 then
    raise exception 'catalogue_empty — hr_items has no rows; the allowlists would accept nothing and reject everything';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'hr_engine') then
    raise exception 'hr_engine role missing — run 2026-08-11-player-state.sql first';
  end if;
  -- The rejection recorder is how a fired clamp survives the rollback that
  -- fires it (review R4). Without it hr_apply would compile and then silently
  -- lose every incident, which is the exact defect being fixed.
  -- Signature includes p_count (review S6): the rate-limit sites pass the
  -- sample weight. Naming the OLD 5-argument signature here would make this
  -- precondition permanently false against a correct database — the same class
  -- of always-null probe as the to_regproc bug fixed above.
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'hr_record_rejection missing — re-run 2026-08-11-player-state.sql (revision 4)';
  end if;
  if to_regprocedure('public.hr_rate_sample_weight(bigint)') is null
     or to_regprocedure('public.hr_rate_over(uuid,text)') is null then
    raise exception 'the rate-limit log sampler is missing — re-run 2026-08-11-player-state.sql (revision 4)';
  end if;
end $$;

-- ── 1. The rejection primitive ───────────────────────────────────────────
-- Every rejection inside a write-bearing block goes through here. Raising
-- (rather than returning) is what makes a rejection ATOMIC: PL/pgSQL's
-- exception handler is a subtransaction boundary, so everything the block did
-- is undone before the caller sees the error.
--
-- SQLSTATE 'HR000' is a private signal. Nothing else in the codebase raises it,
-- so the handler cannot swallow an unrelated failure and mislabel it.
create or replace function public.hr_reject(p_code text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql volatile set search_path = public as $$
begin
  raise exception using errcode = 'HR000', message = p_code,
                       detail = coalesce(p_detail, '{}'::jsonb)::text;
end $$;
revoke execute on function public.hr_reject(text, jsonb)
  from public, anon, authenticated, service_role;

-- ── 2. hr_state_of — assemble one character ──────────────────────────────
-- Split out of hr_load so hr_apply can return the new state WITHOUT depending
-- on auth.uid(): when the engine role calls, the acting user is p_user, not the
-- JWT subject. Revision 1's hr_apply ended with `return hr_load(v_slot)`, which
-- would have read the wrong (or no) user.
--
-- ⚠ VOLATILE, NOT STABLE (reliability RL1). This function is called by hr_apply
--   as the LAST thing it does, immediately after writing player_state,
--   player_inventory and friends, and its return value is the envelope the
--   client uses as the `version` for its NEXT apply. A STABLE function is
--   allowed to reuse the snapshot of the calling statement; in current
--   PL/pgSQL a volatile caller does bump the command counter between
--   statements, so it happens to see its own writes — but "happens to" is not
--   a contract, and the failure mode if it ever stops holding is the nastiest
--   kind: every second apply returns version_conflict, in production, on day
--   one. VOLATILE forces a fresh snapshot and costs nothing here (hr_load is
--   already volatile because it rate-limits, so nothing was being inlined or
--   cached anyway). The behaviour is pinned by a regression test —
--   tests/sql/server-authority.test.sql §12, "chained applies".
create or replace function public.hr_state_of(p_user uuid, p_slot int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_st public.player_state%rowtype;
begin
  select * into v_st from public.player_state
   where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  return jsonb_build_object(
    'ok', true,
    'version', v_st.version,
    -- The server clock, so the client renders countdowns without ever
    -- consulting its own.
    'now', now(),
    'state', jsonb_build_object(
      'slot', v_st.slot, 'gold', v_st.gold, 'gems', v_st.gems,
      'hearth_tokens', v_st.hearth_tokens,
      'hp', v_st.hp, 'max_hp', v_st.max_hp, 'bank_cap', v_st.bank_cap,
      'active_kind', v_st.active_kind, 'active_id', v_st.active_id,
      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to),
    'skills', coalesce((
      select jsonb_object_agg(skill_id, jsonb_build_object(
               'xp', xp, 'level', public.hr_level_from_xp(xp)))
        from public.player_skills where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'inventory', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_inventory where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)
        from public.player_equipment where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'farm', coalesce((
      select jsonb_agg(jsonb_build_object('i', plot_idx, 'crop', crop_id,
                                          'planted_at', planted_at, 'watered_at', watered_at)
                       order by plot_idx)
        from public.player_farm where user_id = p_user and slot = v_st.slot), '[]'::jsonb),
    -- BOUNDED (reliability RL4). Revision 2 read every player_progress row a
    -- character had ever accumulated, on every session start, with no filter
    -- and no limit — and player_progress mints a permanent row per counter per
    -- PERIOD. At 6 dailies that is +2,190 rows/player/year that this query
    -- would keep dragging across the wire forever.
    --   • period rows are filtered to the SAME window hr_progress_prune keeps
    --     (31 days), so the read and the retention policy cannot disagree;
    --   • permanent rows (period_key = '') are unfiltered — they are bounded by
    --     content, and dropping one would hide a completed quest;
    --   • a hard LIMIT is the backstop, and `progress_truncated` tells the
    --     client the truth instead of silently shortening its world.
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'value', value,
                                          'period', period_key, 'state', state))
        from (select kind, key, value, period_key, state
                from public.player_progress
               where user_id = p_user and slot = v_st.slot
                 and (period_key = '' or updated_at >= now() - interval '31 days')
               order by period_key, kind, key
               limit 1000) p), '[]'::jsonb),
    'progress_truncated', (
      select count(*) > 1000 from (
        select 1 from public.player_progress
         where user_id = p_user and slot = v_st.slot
           and (period_key = '' or updated_at >= now() - interval '31 days')
         limit 1001) t),
    'total_level', public.hr_total_level(p_user, v_st.slot)
  );
end $$;
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 3. hr_load — the ONE read the client makes ───────────────────────────
-- The client could read the tables directly (the SELECT-own policies allow it),
-- but then the client decides how to assemble state and six renderers each get
-- a slightly different idea of "the player". One function returns the whole
-- character in one round trip, WITH its version, which is the token the next
-- write must present.
--
-- VOLATILE, not STABLE, because it rate-limits and a rate limiter writes.
-- That is a real trade: hr_load can no longer be routed to a read replica.
-- It is worth it — an unauthenticated-adjacent read that assembles seven
-- tables is exactly the endpoint a bored player loops, and a gateway rule is
-- not in this repo's control. Revisit if replicas are ever introduced.
create or replace function public.hr_load(p_slot int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rate_ok(v_uid, 'load', 180, interval '1 minute') then
    -- (C2) A read path, but three loads a second sustained is a poller, not a
    -- player, and the record costs one row per character per day whatever the
    -- rate — the counter is incremented in place.
    -- (S6) Sampled: 1st, 10th, 50th, then every 1000th.
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'load') - 180) > 0 then
      perform public.hr_record_rejection(v_uid, coalesce(p_slot, 0), 'load', 'rate_limited',
        jsonb_build_object('limit', 180, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'load') - 180));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return public.hr_state_of(v_uid, coalesce(p_slot, 0));
end $$;
revoke execute on function public.hr_load(int) from public, anon, service_role;
grant execute on function public.hr_load(int) to authenticated;

-- ── 4. The delta shape ───────────────────────────────────────────────────
-- hr_apply takes ONE jsonb. Documented here rather than in a wiki because the
-- Edge Functions and this function must agree exactly, and the agreement
-- should be readable in the same file as the code that enforces it.
--
-- {
--   "gold":        <signed bigint>,           -- delta, not absolute
--   "gems":        <signed bigint>,           -- delta; clamped and floored at 0
--   "hp":          <absolute int>,            -- combat sets HP outright
--   "items":       { "<item_id>": <signed bigint>, … },
--   "xp":          { "<skill_id>": <positive bigint>, … },   -- XP never decreases
--   "equip":       { "<equip_slot>": "<item_id>" | null, … }, -- MOVES inventory
--   "activity":    { "kind": "gather|artisan|combat|idle",
--                    "id": "<catalogue id>|null",
--                    "restart": true|false },  -- true → active_since = now()
--   "accrued_to":  "now" | "<iso ts>",         -- clamped to [old, now()]
--   "farm":        [ {"i":0,"crop":"potato","plant":true} | {"i":0,"water":true}
--                    | {"i":0,"clear":true}, … ],
--   "progress":    [ {"kind":"quest","key":"…","period":"","add":1,
--                     "state":"active|done"}, … ],
--   "progress_claim": [ {"kind":"quest","key":"…","period":""}, … ],
--   "journal":     { "kind":"gather", "intent":"collect", "meta":{…} }
-- }
--
-- ⚠ `hp` IS A CLIENT-PROPOSED ABSOLUTE, AND THAT IS A DECISION, NOT AN
--   OVERSIGHT. (Review R10.) The server clamps it to [0, max_hp] and validates
--   nothing else, so an Edge Function — or anything that can reach one — can
--   set HP to max at will. A free full heal.
--
--   Why it is accepted, for now:
--     • Combat is not yet server-resolved. Until it is, the ONLY thing that
--       knows the outcome of a fight is the JS simulation in the Edge Function,
--       and it necessarily reports an absolute. There is no server-side fact to
--       validate against — a "hp delta" would be equally forgeable and would
--       additionally desynchronise on any missed apply.
--     • The blast radius is bounded by design: HP is not tradeable, not
--       rankable and not contributable. It cannot cross into another player's
--       economy or ranking, which is the target property stated in CLAUDE.md.
--       The worst case is that the offender does not die, which costs them
--       nothing another player can feel.
--     • hearth_tokens, gold, gems and items — everything that CAN cross — are
--       deltas with clamps and floors, not absolutes.
--
--   What closes it, and when: when combat moves server-side (the accrual engine
--   owns the fight), `hp` leaves this contract entirely and becomes an OUTPUT.
--   Until then it is listed here, in the intent spec, so that nobody has to
--   rediscover it in a review. Do NOT add other absolutes to this contract.
--
-- ⚠ NOTE WHAT IS ABSENT: there is no "hearth_tokens" key, and no "version",
--   "bank_cap", "max_hp" or "slot" key either. The bond is minted by exactly
--   one path (IAP verification, its own RPC) and the general apply engine
--   physically cannot touch it. Unknown top-level keys are REJECTED rather than
--   ignored, so a typo is an error instead of a silently dropped effect.

-- ── 5. hr_apply ──────────────────────────────────────────────────────────
create or replace function public.hr_apply(
  p_user uuid, p_slot int, p_version bigint, p_intent_id uuid, p_delta jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  -- BLAST-RADIUS CLAMPS. NOT balance, NOT player-facing. They are the blast
  -- radius if an Edge Function is ever wrong or compromised, exactly as the
  -- clamps in clan_deposit (2026-08-08-clan-seat.sql:530) are. Set far above
  -- honest play; treat any rejection as an incident, not a tuning problem.
  c_max_gold_delta   constant bigint := 50000000;   -- per call
  c_max_gem_delta    constant bigint := 100000;     -- per call  (review S5)
  c_max_item_delta   constant bigint := 1000000;    -- per item per call
  c_max_xp_delta     constant bigint := 5000000;    -- per skill per call
  c_max_item_kinds   constant int    := 200;
  c_max_equip_kinds  constant int    := 32;
  c_max_farm_ops     constant int    := 64;
  c_max_progress_ops constant int    := 64;
  c_max_progress_add constant bigint := 1000000;
  c_delta_keys constant text[] := array[
    'gold','gems','hp','items','xp','equip','activity','accrued_to',
    'farm','progress','progress_claim','journal'];
  c_ledger_kinds constant text[] := array[
    'accrue','craft','gather','combat','farm','trade','shop',
    'quest','equip','admin','iap','clan','raid'];

  v_uid   uuid;
  v_role  text;
  v_slot  int  := coalesce(p_slot, 0);
  v_st    public.player_state%rowtype;
  v_j     jsonb;
  v_out   jsonb;
  v_prev  jsonb;
  v_kind  text;
  v_msg   text; v_det text; v_sqlstate text;
  k text; v_n bigint; v_have bigint; v_stacks int;
  v_eq    jsonb; v_item text; v_cur text;
  v_plot  jsonb; v_prog jsonb;
  v_new_gold bigint; v_new_gems bigint;
  v_act   jsonb; v_accrued timestamptz; v_rows int;
  v_meta  jsonb;
begin
  -- ── (0) THE IDENTITY SEAM (review S1) ──────────────────────────────────
  -- hr_apply is granted to exactly one role. `hr_engine` may act for a user it
  -- names, because it has already verified that user's JWT and it holds no
  -- table privilege of its own. Nobody else may name a user at all.
  --
  -- ⚠ current_user IS NOT THE CALLER HERE. Inside a SECURITY DEFINER function
  --   current_user is the function's OWNER (postgres), so a `current_user =
  --   'hr_engine'` test can never be true — verified on the database, not
  --   assumed. The GUC set by PostgREST's `SET LOCAL ROLE <jwt.role>` does
  --   survive the definer boundary, and that is what is read below.
  --
  --   The GUC is a SECONDARY check. The PRIMARY control is the GRANT: hr_apply
  --   is executable by hr_engine and by nothing else a request can arrive as,
  --   so reaching this line at all already means the caller is the engine (or
  --   the owner, running a migration or a test). The GUC test exists so that
  --   an owner-context call — a psql session, a future admin script — cannot
  --   silently act as an arbitrary user without saying so.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role = 'hr_engine' then
    v_uid := coalesce(p_user, auth.uid());
  else
    v_uid := auth.uid();
    if p_user is not null and p_user is distinct from v_uid then
      -- Recorded even though it never reaches the protected block: this is the
      -- single most interesting thing anyone can do to this function. (R4.)
      perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'forbidden_impersonation',
        jsonb_build_object('claimed_user', p_user, 'role', v_role));
      return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation');
    end if;
  end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  if p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_delta');
  end if;
  if p_intent_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_intent_id');
  end if;
  -- Unknown top-level keys are an error, not a shrug. A delta key that this
  -- function does not implement must never look like it worked.
  if exists (select 1 from jsonb_object_keys(p_delta) as t(dk)
              where dk <> all (c_delta_keys)) then
    v_out := jsonb_build_object('ok', false, 'error', 'unknown_delta_key',
      'keys', (select jsonb_agg(dk) from jsonb_object_keys(p_delta) as t(dk)
                where dk <> all (c_delta_keys)));
    -- An unknown key means the Edge Function and this contract have diverged,
    -- or someone is probing for one that is not implemented. Both are worth
    -- knowing about tomorrow, not just for the next 24 hours. (R4.)
    perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'unknown_delta_key',
      jsonb_build_object('keys', v_out->'keys'));
    return v_out;
  end if;

  -- ── (1) Rate limit. OUTSIDE the protected block on purpose: a rejected call
  --        must still consume budget, otherwise "spam invalid deltas" is a free
  --        denial of service against the engine.
  if not public.hr_rate_ok(v_uid, 'apply', 240, interval '1 minute') then
    -- (C2) Recorded BEFORE the return, and before the intent claim, because
    -- otherwise a rate-limited caller leaves no durable trace anywhere: the
    -- early return happens ahead of player_intents, and player_intents is
    -- pruned after 24h regardless. Sustained rate limiting is the loudest
    -- automation signal this server produces and it was being discarded.
    -- hr_record_rejection aggregates per (character, code, day) and promotes
    -- the row to severity 'incident' past its daily threshold, so this costs
    -- one row per player per day, not one row per rejected call.
    --
    -- (S6) …but still one WRITE per rejected call, which under the retry storm
    -- this exists to detect is a row lock plus a WAL record per request, all
    -- serialised on one tuple. So it is SAMPLED: the 1st, 10th and 50th
    -- rejection in the window, then every 1000th, each carrying the gap it
    -- stands for so `n` and the 'incident' escalation are unchanged.
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'rate_limited',
        jsonb_build_object('limit', 240, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- ── (2) Serialise this character. hashtextextended over user+slot; the lock
  --        is transaction-scoped so it always releases, exception included.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- ── (3) IDEMPOTENCY (review S8). Under the lock, so the check and the claim
  --        cannot interleave. A replay returns the FIRST answer — success or
  --        rejection — because "same key, same answer" is the contract that
  --        makes a client retry safe.
  --
  --        WHAT IS STORED IS THE DECISION, NOT THE ENVELOPE (review R5).
  --        Revision 2 stored the ENTIRE hr_state_of envelope — inventory,
  --        fifteen skills, farm plots, progress — in player_intents.result, per
  --        intent, at up to 240 applies/min/player. That is a full state
  --        snapshot roughly every quarter second per player, retained 24 hours:
  --        ~2 KB × 240 × 60 × 24 = 690 MB PER PLAYER PER DAY at the rate limit,
  --        and this repo already has the receipt for what an unbounded journal
  --        does here (game_events: 1.6M rows / 229 MB, six players, 3.45 days).
  --        Now only `{ok}` (plus the error and its detail on a rejection) is
  --        stored — tens of bytes — and a REPLAY OF A SUCCESS RE-DERIVES the
  --        current state. That is strictly better for the caller too: a retry
  --        gets fresh state and a fresh version instead of a stale snapshot it
  --        would then have to discard. The contract is unchanged and is the one
  --        that matters: the same key applies the effect exactly once.
  select result into v_prev from public.player_intents
   where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev is null then
      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
    end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  -- (N3) The advisory lock above is keyed on user:SLOT, but the intent PK is
  -- (user_id, intent_id) — no slot. Two slots replaying the same intent_id
  -- concurrently therefore both miss the select and both insert, and the loser
  -- gets an unhandled unique_violation (a 500) instead of an answer. Exotic
  -- today (one character is active at a time) but it is a race, and a race
  -- closed by `on conflict do nothing` costs nothing. The key stays
  -- user-global rather than slot-scoped on purpose: a client-generated uuid
  -- that means two different things on two slots is a worse contract than one
  -- that is simply already taken.
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_intent_id, v_slot, p_delta #>> '{journal,intent}')
  on conflict (user_id, intent_id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
  end if;

  -- ══ THE PROTECTED BLOCK ═══════════════════════════════════════════════
  -- Everything from here to the handler is all-or-nothing. Every rejection is
  -- hr_reject(), which raises; the handler below undoes the block. (Review S2.)
  begin
    select * into v_st from public.player_state
      where user_id = v_uid and slot = v_slot for update;
    if not found then perform public.hr_reject('no_character'); end if;

    -- (4) OPTIMISTIC CONCURRENCY — MANDATORY (review S9). Revision 1 skipped
    -- the check when p_version was null, which meant the caller chose whether
    -- concurrency control applied. A missing version IS a conflict.
    if p_version is null or p_version <> v_st.version then
      perform public.hr_reject('version_conflict',
                               jsonb_build_object('version', v_st.version));
    end if;

    -- ── GOLD ─────────────────────────────────────────────────────────────
    v_new_gold := v_st.gold;
    if p_delta ? 'gold' then
      v_n := coalesce((p_delta->>'gold')::bigint, 0);
      if abs(v_n) > c_max_gold_delta then
        perform public.hr_reject('gold_clamp', jsonb_build_object('limit', c_max_gold_delta));
      end if;
      v_new_gold := v_st.gold + v_n;
      if v_new_gold < 0 then
        perform public.hr_reject('insufficient_gold',
                                 jsonb_build_object('have', v_st.gold, 'need', -v_n));
      end if;
    end if;

    -- ── GEMS (review S5) ─────────────────────────────────────────────────
    -- Revision 1 wrote `greatest(0, gems + delta)` with no clamp and no error:
    -- spending 10 gems while holding 3 succeeded and silently cost 3. Gems are
    -- a premium currency; a silent partial spend is a support ticket at best.
    v_new_gems := v_st.gems;
    if p_delta ? 'gems' then
      v_n := coalesce((p_delta->>'gems')::bigint, 0);
      if abs(v_n) > c_max_gem_delta then
        perform public.hr_reject('gem_clamp', jsonb_build_object('limit', c_max_gem_delta));
      end if;
      v_new_gems := v_st.gems + v_n;
      if v_new_gems < 0 then
        perform public.hr_reject('insufficient_gems',
                                 jsonb_build_object('have', v_st.gems, 'need', -v_n));
      end if;
    end if;

    -- ── ITEMS ─ the delta is signed; a spend and a gain are the same code ─
    if p_delta ? 'items' then
      if jsonb_typeof(p_delta->'items') <> 'object' then
        perform public.hr_reject('bad_items');
      end if;
      if (select count(*) from jsonb_object_keys(p_delta->'items')) > c_max_item_kinds then
        perform public.hr_reject('too_many_item_kinds');
      end if;
      for k, v_n in select key, coalesce(nullif(value,'')::bigint, 0)
                      from jsonb_each_text(p_delta->'items') loop
        if v_n = 0 then continue; end if;
        if abs(v_n) > c_max_item_delta then
          perform public.hr_reject('item_clamp', jsonb_build_object('item_id', k));
        end if;
        -- Unknown ids are refused unconditionally now. hr_items is GENERATED
        -- from src/data/items.js; if it is missing this function errors, which
        -- is the correct direction to fail. (Review S3.)
        if not exists (select 1 from public.hr_items where item_id = k) then
          perform public.hr_reject('unknown_item', jsonb_build_object('item_id', k));
        end if;
        select qty into v_have from public.player_inventory
          where user_id = v_uid and slot = v_slot and item_id = k for update;
        v_have := coalesce(v_have, 0);
        if v_have + v_n < 0 then
          perform public.hr_reject('insufficient_item',
            jsonb_build_object('item_id', k, 'have', v_have, 'need', -v_n));
        end if;
        if v_have + v_n = 0 then
          delete from public.player_inventory
            where user_id = v_uid and slot = v_slot and item_id = k;
        else
          insert into public.player_inventory as pi (user_id, slot, item_id, qty)
            values (v_uid, v_slot, k, v_have + v_n)
            on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
        end if;
      end loop;
    end if;

    -- ── XP ─ monotonic. A negative XP delta is a caller bug, and accepting one
    --        would make a rollback indistinguishable from an exploit.
    if p_delta ? 'xp' then
      if jsonb_typeof(p_delta->'xp') <> 'object' then perform public.hr_reject('bad_xp'); end if;
      for k, v_n in select key, coalesce(nullif(value,'')::bigint, 0)
                      from jsonb_each_text(p_delta->'xp') loop
        if v_n <= 0 then continue; end if;
        if v_n > c_max_xp_delta then
          perform public.hr_reject('xp_clamp', jsonb_build_object('skill_id', k));
        end if;
        update public.player_skills set xp = xp + v_n
          where user_id = v_uid and slot = v_slot and skill_id = k;
        get diagnostics v_rows = row_count;
        if v_rows <> 1 then
          perform public.hr_reject('unknown_skill', jsonb_build_object('skill_id', k));
        end if;
      end loop;
    end if;

    -- ── EQUIPMENT (review S4) ────────────────────────────────────────────
    -- Equipping is a TRANSFER, not a flag. One unit leaves player_inventory
    -- and one unit comes back on unequip or swap, so the total the player owns
    -- is conserved and the equip/unequip duplication is arithmetically
    -- impossible rather than merely unimplemented.
    --
    -- Four gates, all against the SERVER's data:
    --   • the equip slot exists                 (hr_equip_slots)
    --   • the item exists                       (hr_items)
    --   • the item fits that slot               (hr_item_slots — 'ring' is
    --     expanded to ring1/ring2 by the generator, in JS, next to the data)
    --   • the player meets reqSkill/reqLv       (player_skills, derived level)
    if p_delta ? 'equip' then
      if jsonb_typeof(p_delta->'equip') <> 'object' then perform public.hr_reject('bad_equip'); end if;
      if (select count(*) from jsonb_object_keys(p_delta->'equip')) > c_max_equip_kinds then
        perform public.hr_reject('too_many_equip_ops');
      end if;
      for k, v_eq in select key, value from jsonb_each(p_delta->'equip') loop
        if not exists (select 1 from public.hr_equip_slots where equip_slot = k) then
          perform public.hr_reject('unknown_equip_slot', jsonb_build_object('equip_slot', k));
        end if;

        select item_id into v_cur from public.player_equipment
         where user_id = v_uid and slot = v_slot and equip_slot = k for update;

        if jsonb_typeof(v_eq) = 'null' then
          -- UNEQUIP: return the unit to the bank.
          if v_cur is not null then
            delete from public.player_equipment
             where user_id = v_uid and slot = v_slot and equip_slot = k;
            insert into public.player_inventory as pi (user_id, slot, item_id, qty)
              values (v_uid, v_slot, v_cur, 1)
              on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
          end if;
          continue;
        end if;

        if jsonb_typeof(v_eq) <> 'string' then
          perform public.hr_reject('bad_equip', jsonb_build_object('equip_slot', k));
        end if;
        v_item := v_eq #>> '{}';
        if v_cur is not null and v_cur = v_item then continue; end if;   -- no-op

        if not exists (select 1 from public.hr_items where item_id = v_item) then
          perform public.hr_reject('unknown_item', jsonb_build_object('item_id', v_item));
        end if;
        if not exists (select 1 from public.hr_item_slots
                        where item_id = v_item and equip_slot = k) then
          perform public.hr_reject('wrong_slot',
            jsonb_build_object('item_id', v_item, 'equip_slot', k));
        end if;
        -- The requirement is re-checked here even though the Edge Function
        -- already checked it. "The caller checked" is not a control.
        if exists (
          select 1 from public.hr_items i
           where i.item_id = v_item and i.req_skill is not null and i.req_lv is not null
             and coalesce((select public.hr_level_from_xp(s.xp) from public.player_skills s
                            where s.user_id = v_uid and s.slot = v_slot
                              and s.skill_id = i.req_skill), 1) < i.req_lv)
        then
          perform public.hr_reject('requirement_not_met', jsonb_build_object('item_id', v_item));
        end if;

        -- DEBIT one from the bank. This is the ownership check; there is
        -- nothing else to check.
        select qty into v_have from public.player_inventory
         where user_id = v_uid and slot = v_slot and item_id = v_item for update;
        if coalesce(v_have, 0) < 1 then
          perform public.hr_reject('insufficient_item',
            jsonb_build_object('item_id', v_item, 'have', coalesce(v_have, 0), 'need', 1));
        end if;
        if v_have = 1 then
          delete from public.player_inventory
           where user_id = v_uid and slot = v_slot and item_id = v_item;
        else
          update public.player_inventory set qty = qty - 1
           where user_id = v_uid and slot = v_slot and item_id = v_item;
        end if;

        -- CREDIT back whatever was in the slot.
        if v_cur is not null then
          insert into public.player_inventory as pi (user_id, slot, item_id, qty)
            values (v_uid, v_slot, v_cur, 1)
            on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
        end if;

        insert into public.player_equipment as pe (user_id, slot, equip_slot, item_id)
          values (v_uid, v_slot, k, v_item)
          on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
      end loop;
    end if;

    -- ── BANK CAP ─ counted once, AFTER items and equipment, because both can
    --   create a stack. Revision 1 checked it mid-way through the item loop and
    --   then returned, committing the items it had already written.
    --   A NEW stack is what costs space, so a player at cap can still gain more
    --   of what they already hold.
    --   BOUNDED COUNT (reliability RL4): the question is "> cap?", not "how
    --   many?", so the scan stops at cap+1 rows instead of walking a 100,000-
    --   stack bank on every item-touching apply.
    if (p_delta ? 'items') or (p_delta ? 'equip') then
      select count(*) into v_stacks from (
        select 1 from public.player_inventory
         where user_id = v_uid and slot = v_slot
         limit v_st.bank_cap + 1) s;
      if v_stacks > v_st.bank_cap then
        perform public.hr_reject('bank_full',
          jsonb_build_object('stacks', v_stacks, 'cap', v_st.bank_cap));
      end if;
    end if;

    -- ── FARM ─ planting stamps the SERVER clock. `planted_at` can never be
    --   supplied by anyone: that single line is the whole farming exploit
    --   closed. The crop id is checked against the generated catalogue.
    if p_delta ? 'farm' then
      if jsonb_typeof(p_delta->'farm') <> 'array' then perform public.hr_reject('bad_farm'); end if;
      if jsonb_array_length(p_delta->'farm') > c_max_farm_ops then
        perform public.hr_reject('too_many_farm_ops');
      end if;
      for v_plot in select value from jsonb_array_elements(p_delta->'farm') loop
        if coalesce((v_plot->>'clear')::boolean, false) then
          update public.player_farm
             set crop_id = null, planted_at = null, watered_at = null
           where user_id = v_uid and slot = v_slot and plot_idx = (v_plot->>'i')::int;
        elsif coalesce((v_plot->>'plant')::boolean, false) then
          if not exists (select 1 from public.hr_crops where crop_id = v_plot->>'crop') then
            perform public.hr_reject('unknown_crop', jsonb_build_object('crop', v_plot->>'crop'));
          end if;
          update public.player_farm
             set crop_id = v_plot->>'crop', planted_at = now(), watered_at = null
           where user_id = v_uid and slot = v_slot and plot_idx = (v_plot->>'i')::int
             and crop_id is null;                   -- never replant an occupied plot
          get diagnostics v_rows = row_count;
          if v_rows <> 1 then
            perform public.hr_reject('plot_unavailable', jsonb_build_object('i', v_plot->>'i'));
          end if;
        elsif coalesce((v_plot->>'water')::boolean, false) then
          update public.player_farm set watered_at = now()
           where user_id = v_uid and slot = v_slot and plot_idx = (v_plot->>'i')::int
             and crop_id is not null and watered_at is null;
        end if;
      end loop;
    end if;

    -- ── PROGRESS (review S13) ────────────────────────────────────────────
    -- Revision 1 inserted whatever `kind` and `state` the delta named, with an
    -- unbounded `add`. `kind` typos became a parallel universe of rows; `state`
    -- accepted 'claimed', which is the one value that gates a payout.
    -- Here: `kind` is checked, `add` is clamped and non-negative, and 'claimed'
    -- is unreachable — the separate claim block below is the only route.
    if p_delta ? 'progress' then
      if jsonb_typeof(p_delta->'progress') <> 'array' then perform public.hr_reject('bad_progress'); end if;
      if jsonb_array_length(p_delta->'progress') > c_max_progress_ops then
        perform public.hr_reject('too_many_progress_ops');
      end if;
      for v_prog in select value from jsonb_array_elements(p_delta->'progress') loop
        if coalesce(v_prog->>'kind','') not in
             ('quest','daily','bounty','stat','collection','flag') then
          perform public.hr_reject('bad_progress_kind', jsonb_build_object('kind', v_prog->>'kind'));
        end if;
        if length(coalesce(v_prog->>'key','')) not between 1 and 64
           or length(coalesce(v_prog->>'period','')) > 16 then
          perform public.hr_reject('bad_progress_key');
        end if;
        if coalesce(v_prog->>'state','active') not in ('active','done') then
          perform public.hr_reject('bad_progress_state',
            jsonb_build_object('state', v_prog->>'state'));
        end if;
        v_n := coalesce((v_prog->>'add')::bigint, 0);
        if v_n < 0 or v_n > c_max_progress_add then
          perform public.hr_reject('progress_clamp', jsonb_build_object('add', v_n));
        end if;
        insert into public.player_progress as pp
          (user_id, slot, kind, key, period_key, value, state, updated_at)
        values (v_uid, v_slot, v_prog->>'kind', v_prog->>'key',
                coalesce(v_prog->>'period',''), v_n, v_prog->>'state', now())
        on conflict (user_id, slot, kind, key, period_key) do update
          set value = pp.value + v_n,
              -- A row already 'claimed' is terminal until its period rolls.
              state = case when pp.state = 'claimed' then pp.state
                           else coalesce(v_prog->>'state', pp.state) end,
              updated_at = now();
      end loop;
    end if;

    -- ── PROGRESS CLAIM ─ the only path to 'claimed', and it requires the row
    --   to already be 'done'. `row_count` is the check: a claim that changes
    --   nothing is a claim of something that was not earned, or a double claim.
    if p_delta ? 'progress_claim' then
      if jsonb_typeof(p_delta->'progress_claim') <> 'array' then
        perform public.hr_reject('bad_progress_claim');
      end if;
      for v_prog in select value from jsonb_array_elements(p_delta->'progress_claim') loop
        update public.player_progress
           set state = 'claimed', updated_at = now()
         where user_id = v_uid and slot = v_slot
           and kind = v_prog->>'kind' and key = v_prog->>'key'
           and period_key = coalesce(v_prog->>'period','')
           and state = 'done';
        get diagnostics v_rows = row_count;
        if v_rows <> 1 then
          perform public.hr_reject('not_claimable',
            jsonb_build_object('kind', v_prog->>'kind', 'key', v_prog->>'key'));
        end if;
      end loop;
    end if;

    -- ── ACTIVITY ─────────────────────────────────────────────────────────
    -- (Review R11.) Revision 2 gated the whole block on `v_act ? 'kind'`, so
    -- `{"activity":{"restart":true}}` skipped EVERY check and still reached the
    -- UPDATE, where `restart` resets active_since to now(). A caller could
    -- therefore restamp the activity clock — the input to accrual — without
    -- naming an activity, without a catalogue lookup and without the skill
    -- gate. `{"activity":{}}` was likewise accepted and did nothing, which is
    -- the "silently dropped effect" this contract explicitly refuses elsewhere.
    -- Now: an `activity` key means a complete, validated activity statement.
    v_act := p_delta->'activity';
    if p_delta ? 'activity' then
      if jsonb_typeof(v_act) <> 'object' then perform public.hr_reject('bad_activity'); end if;
      if not (v_act ? 'kind') then
        perform public.hr_reject('bad_activity',
          jsonb_build_object('why', 'activity requires kind; restart alone is not an activity'));
      end if;
      if exists (select 1 from jsonb_object_keys(v_act) as t(ak)
                  where ak <> all (array['kind','id','restart'])) then
        perform public.hr_reject('bad_activity', jsonb_build_object('why', 'unknown activity key'));
      end if;
      if (v_act ? 'restart') and jsonb_typeof(v_act->'restart') <> 'boolean' then
        perform public.hr_reject('bad_activity', jsonb_build_object('why', 'restart must be boolean'));
      end if;
      -- The (kind ⇔ id) invariant is a table CHECK, and hitting a CHECK yields
      -- an opaque 23514. Answer it here so a caller bug reads as a caller bug.
      if (v_act->>'kind' = 'idle') <> (nullif(v_act->>'id','') is null) then
        perform public.hr_reject('bad_activity');
      end if;
      if v_act->>'kind' <> 'idle' then
        if not exists (select 1 from public.hr_activities
                        where kind = v_act->>'kind' and activity_id = v_act->>'id') then
          perform public.hr_reject('unknown_activity',
            jsonb_build_object('kind', v_act->>'kind', 'id', v_act->>'id'));
        end if;
        -- Re-check the skill gate against SERVER xp. A forged local level buys
        -- nothing, including the right to start a level-90 node.
        if exists (
          select 1 from public.hr_activities a
           where a.kind = v_act->>'kind' and a.activity_id = v_act->>'id'
             and a.req_skill is not null and a.req_lv is not null
             and coalesce((select public.hr_level_from_xp(s.xp) from public.player_skills s
                            where s.user_id = v_uid and s.slot = v_slot
                              and s.skill_id = a.req_skill), 1) < a.req_lv)
        then
          perform public.hr_reject('activity_locked', jsonb_build_object('id', v_act->>'id'));
        end if;
      end if;
    end if;

    -- ── ACCRUAL WATERMARK (review S19) ───────────────────────────────────
    -- Revision 1 set accrued_to = now() AT APPLY TIME while the ticks had been
    -- computed from the READ time, so every round trip silently confiscated the
    -- elapsed milliseconds between the two — a few hundred per collect, forever.
    -- The caller now states the watermark it actually paid up to, and the server
    -- CLAMPS it into [old, now()]: it can never move backwards (which would pay
    -- the same seconds twice) and never into the future (which would pay for
    -- time that has not happened). "now" remains accepted as shorthand.
    v_accrued := v_st.accrued_to;
    if p_delta ? 'accrued_to' then
      if p_delta->>'accrued_to' = 'now' then
        v_accrued := now();
      else
        v_accrued := (p_delta->>'accrued_to')::timestamptz;
      end if;
      v_accrued := least(now(), greatest(v_st.accrued_to, v_accrued));
    end if;

    update public.player_state
       set gold = v_new_gold,
           gems = v_new_gems,
           hp   = case when p_delta ? 'hp'
                       then greatest(0, least(max_hp, coalesce((p_delta->>'hp')::int, hp)))
                       else hp end,
           active_kind  = coalesce(v_act->>'kind', active_kind),
           active_id    = case when v_act ? 'kind'
                               then nullif(v_act->>'id','') else active_id end,
           active_since = case when coalesce((v_act->>'restart')::boolean, false)
                               then now() else active_since end,
           accrued_to   = v_accrued,
           version      = version + 1,
           updated_at   = now()
     where user_id = v_uid and slot = v_slot;

    -- ── JOURNAL ─ ONE row per apply. Per-item rows would multiply the write
    --   volume of an idle game for detail `meta` already carries — and this
    --   repo has the receipt: game_events, 1.6M rows / 229 MB, six players,
    --   four days. A very large delta is summarised rather than stored whole,
    --   so one pathological call cannot write a megabyte.
    --
    --   AND ONE ROW IS NOT ENOUGH IF THE ROW IS HUGE (reliability RL2(b)).
    --   Revision 2 stored `p_delta - 'journal'` — the WHOLE proposed delta, up
    --   to 200 item keys plus farm ops plus progress ops — as meta. Measured
    --   projection: ~2.5× a game_events row, ×2 indexes, 600 MB/day at 600
    --   players. Rebuilding game_events under a new name is exactly the mistake
    --   this comment block was written to prevent.
    --
    --   What is kept is what a ledger is FOR: the value that moved. Gold, gems,
    --   items, xp and equipment transfers are recorded (they are the audit
    --   trail, and they are small — a real accrual apply touches 1-5 item
    --   kinds). Everything else is recorded as a KEY NAME only, because the
    --   authoritative record of it is the row it wrote: farm state is in
    --   player_farm, progress is in player_progress, the activity pointer and
    --   accrued_to are in player_state, and all of them are reachable from this
    --   row's timestamp. `k` is the list of those keys, so the ledger still
    --   says what kind of thing happened.
    v_j    := coalesce(p_delta->'journal', '{}'::jsonb);
    v_kind := coalesce(v_j->>'kind', 'admin');
    if v_kind <> all (c_ledger_kinds) then v_kind := 'admin'; end if;
    v_meta := jsonb_strip_nulls(jsonb_build_object(
      'g',  nullif(coalesce((p_delta->>'gold')::bigint, 0), 0),
      'm',  nullif(coalesce((p_delta->>'gems')::bigint, 0), 0),
      'i',  case when p_delta ? 'items'
                 and (select count(*) from jsonb_object_keys(p_delta->'items')) <= 24
                 then p_delta->'items' end,
      'x',  case when p_delta ? 'xp' then p_delta->'xp' end,
      'e',  case when p_delta ? 'equip' then p_delta->'equip' end,
      'k',  (select jsonb_agg(dk order by dk) from jsonb_object_keys(p_delta) as t(dk)
              where dk <> all (array['gold','gems','items','xp','equip','journal']))
    ));
    -- If items were too numerous to itemise, say so with an aggregate rather
    -- than dropping the fact that a large transfer happened.
    if p_delta ? 'items' and not (v_meta ? 'i') then
      v_meta := v_meta || jsonb_build_object('i_n',
        (select count(*) from jsonb_object_keys(p_delta->'items')),
        'i_sum', (select sum(coalesce(nullif(value,'')::bigint, 0))
                    from jsonb_each_text(p_delta->'items')));
    end if;
    -- Backstop. Nothing above should be able to reach this, which is why it is
    -- 2 KB and not 8 KB: if it ever fires, the shape has regressed.
    if pg_column_size(v_meta) > 2000 then
      v_meta := jsonb_build_object('summary', true, 'bytes', pg_column_size(p_delta),
        'k', (select jsonb_agg(dk order by dk) from jsonb_object_keys(p_delta) as t(dk)));
    end if;
    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, meta)
    values
      (v_uid, v_slot, v_kind, v_j->>'intent',
       coalesce((p_delta->>'gold')::bigint, 0),
       jsonb_build_object('delta', v_meta) || coalesce(v_j->'meta', '{}'::jsonb));

    v_out := public.hr_state_of(v_uid, v_slot);

  exception
    -- Our own rejections. The block is rolled back; the envelope is built from
    -- the machine code and its detail payload.
    when sqlstate 'HR000' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_out := jsonb_build_object('ok', false, 'error', v_msg)
               || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
    -- A malformed delta that reaches a cast or a constraint. Rolled back and
    -- reported rather than surfacing as a 500 — but NEVER silently: the
    -- sqlstate is returned so a caller bug is diagnosable from the response.
    when invalid_text_representation or invalid_datetime_format
      or numeric_value_out_of_range or division_by_zero
      or check_violation or not_null_violation or foreign_key_violation
      or unique_violation or datatype_mismatch then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      v_out := jsonb_build_object('ok', false, 'error', 'bad_delta',
                                  'sqlstate', v_sqlstate, 'detail', v_msg);
  end;

  -- ── (5) Record the DECISION under the idempotency key. This statement is
  --        OUTSIDE the protected block, so it survives a rejection: a replay of
  --        a rejected intent returns the same rejection instead of re-running
  --        it. Only the decision is stored, never the state envelope (R5, and
  --        the reasoning is at step (3)) — on a success that is literally
  --        `{"ok": true}`.
  update public.player_intents
     set result = case when coalesce(v_out->>'ok','false') = 'true'
                       then jsonb_build_object('ok', true)
                       else v_out end
   where user_id = v_uid and intent_id = p_intent_id;

  -- ── (6) THE REJECTION RECORD (review R4). Also outside the protected block,
  --        and that is the entire point: the ledger insert that revision 2
  --        relied on for an audit trail sits INSIDE the block, so a rejection
  --        rolled it back and the only trace of a fired clamp was
  --        player_intents.result — which hr_intents_prune deletes after 24
  --        hours. The design says "treat any rejection as an incident"; an
  --        incident nobody can see the next morning is not one.
  --
  --        hr_record_rejection aggregates per (character, code, day) and
  --        classifies incident vs normal itself, so this is a bounded write —
  --        one UPSERT, not a row per rejection. See player-state.sql §6b-ii for
  --        why that shape and not a log.
  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(
      v_uid, v_slot, coalesce(p_delta #>> '{journal,intent}', 'apply'),
      v_out->>'error', v_out - 'ok' - 'error');
  end if;

  return v_out;
end $$;

-- GRANTS. Revoke from PUBLIC first: Postgres grants EXECUTE to PUBLIC on every
-- new function, and Supabase's default ACL additionally grants it to anon,
-- authenticated and service_role. Revoking from `authenticated` alone leaves
-- the privilege intact three other ways. This ordering is the difference
-- between a locked door and a locked door with the key under the mat.
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
-- The ONLY grantee. hr_engine holds no table privilege (asserted in file 1), so
-- a compromised Edge Function's entire capability is "propose a delta to a
-- function that re-validates every invariant". If the browser could call this,
-- the browser could author its own delta and the clamps would become the
-- game's rules instead of its blast radius.
grant execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 6. Self-verification ─────────────────────────────────────────────────
do $$
declare v_bad int; v_p oid;
begin
  if to_regprocedure('public.hr_load(int)') is null then raise exception 'hr_load missing'; end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then raise exception 'hr_state_of missing'; end if;
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply missing';
  end if;

  -- (a) hr_apply must be executable by hr_engine and by NOBODY else that a
  --     request can arrive as. This is the single most important assertion in
  --     the file.
  v_p := to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)')::oid;
  if has_function_privilege('anon', v_p, 'execute')
     or has_function_privilege('authenticated', v_p, 'execute')
     or has_function_privilege('service_role', v_p, 'execute') then
    raise exception 'hr_apply is executable by a client or service role — revoke it';
  end if;
  if not has_function_privilege('hr_engine', v_p, 'execute') then
    raise exception 'hr_apply is not executable by hr_engine — the engine cannot commit';
  end if;

  -- (b) hr_engine still holds zero table privileges. If hr_apply's grant ever
  --     arrives alongside a table grant, the architectural guarantee is gone.
  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'hr_engine';
  if v_bad > 0 then
    raise exception 'hr_engine holds % table privileges — it must hold ZERO', v_bad;
  end if;

  -- (c) No function this file defines may be anon-executable. (Review S6/S7.)
  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_apply','hr_load','hr_state_of','hr_reject')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then raise exception '% functions in this file are anon-executable', v_bad; end if;

  -- (d) The catalogue the validation depends on is present and populated.
  --     Fail closed, loudly, rather than validating against nothing. (S3.)
  if (select count(*) from public.hr_items) = 0 then
    raise exception 'hr_items is empty — every allowlist in hr_apply would be vacuous';
  end if;
  if (select count(*) from public.hr_equip_slots) = 0 then
    raise exception 'hr_equip_slots is empty — every equip would be rejected';
  end if;

  -- (e) hr_reject really raises HR000, because every rollback in this file
  --     depends on that one sqlstate.
  begin
    perform public.hr_reject('probe');
    raise exception 'hr_reject did not raise';
  exception when sqlstate 'HR000' then null;
  end;

  -- (f) hr_state_of must be VOLATILE (reliability RL1). If someone "optimises"
  --     it back to STABLE, hr_apply's returned envelope is no longer guaranteed
  --     to reflect the writes hr_apply just made, and the client's next apply
  --     fails with version_conflict. That is a production-day-one outage caused
  --     by a one-word change, so it gets an assertion rather than a comment.
  if (select provolatile from pg_proc
       where oid = to_regprocedure('public.hr_state_of(uuid,int)')) <> 'v' then
    raise exception 'hr_state_of is not VOLATILE — hr_apply may return pre-write state (see RL1)';
  end if;

  raise notice 'APPLY ENGINE OK — hr_apply is hr_engine-only, rejections roll back and are recorded, catalogue is live.';
end $$;
