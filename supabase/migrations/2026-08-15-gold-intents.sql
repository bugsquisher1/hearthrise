-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE GOLD INTENTS, SERVER HALF  (b351)
--   shop_buy  (gold -> items)   ·   vendor_sell  (items -> gold)
--
-- ⚠ REVIEW ONLY — STAGED, NOT APPLIED. The Coordinator applies. Nothing in
--   this branch was applied, deployed or pushed.
--
-- Companion code: supabase/functions/hr-accrue/{shop-buy,vendor-sell,spend,
-- catalogue,intents,request}.js. Companion test: tests/gold-intents.mjs.
-- Governing rule: CLAUDE.md "Server authority (locked 2026-08-10)".
--
-- ── WHY THIS FILE IS FORTY LINES OF SQL FOR TWO ECONOMY VERBS ────────────
-- The same reason 2026-08-15-activity-intent.sql was: the rules are JavaScript
-- and they are already vendored into the Edge Function. Re-expressing 128 shop
-- offers, 221 cost lines and 426 item values in PL/pgSQL would be a second copy
-- of the game's economy, and a second copy drifts — that failure has already
-- happened in this repo (see the `unifyObject` header in src/main.js).
-- The 2026-08-15 architecture ruling says it in one line: if an operation needs
-- the game's RULES it is JavaScript computing a delta; if it is pure
-- bookkeeping it is a database function.
--
-- Everything the DATABASE owns for these two verbs ALREADY EXISTS and is live:
--   · `hr_items` — the GENERATED item catalogue every `items` line in a delta
--     is validated against, so a forged item id is refused by data that came
--     out of src/data/items.js rather than by a hand-written list;
--   · hr_apply's GOLD block — the per-call clamp (50,000,000) and
--     `insufficient_gold`, computed under the per-character advisory lock after
--     `select ... for update`, which is the ONLY answer in this system to
--     "can they afford it";
--   · hr_apply's ITEMS block — `unknown_item`, `insufficient_item`,
--     `item_clamp`, and the `bank_full` stack check;
--   · `hr_day_budget_check` — the 25,000,000/day GROSS GOLD INFLOW ceiling,
--     stamped by hr_apply from the delta itself. There is no delta key for the
--     stamp, so a compromised engine cannot understate its own consumption.
--     This is the fuse under `vendor_sell`, which is the first client-reachable
--     path in the program that MINTS gold;
--   · `player_intents` + `intent_mismatch` + the b346 slot scope — idempotency
--     and the collision refusal that makes a CLIENT-CHOSEN key safe.
--
-- So the only thing missing in Postgres is a rate budget for the new verbs.
-- One `create or replace`. That is the whole SQL delta.
--
-- ── THE BUCKET, AND WHY ONE RATHER THAN TWO ─────────────────────────────
-- `shop` — 30 calls per minute per user, shared by both verbs. They are one
-- surface (the NPC shop) and a player hammering it should exhaust one budget,
-- not two. The cost is stated rather than discovered: a client that sells forty
-- stacks in a loop can rate-limit its own next purchase. Batch the sell with
-- `qty`; do not widen the gate.
--
-- The number matches `accrue` and `activity`. A shop verb does strictly LESS
-- work than a set_activity (one apply against a collect plus a switch), so 30
-- is conservative rather than generous, and it is the third counter — a client
-- can now spend 90 engine calls/minute/user across the three buckets. Stated
-- rather than discovered.
--
-- ⚠ WITHOUT THIS FILE THE TWO VERBS ARE INERT, NOT BROKEN. `hr_rate_gate`'s
--   `else return false` means an unknown bucket fails CLOSED: every shop_buy
--   and vendor_sell answers 429 `rate_limited`, having read nothing and written
--   nothing. That is the correct order of operations for a staged change —
--   the Edge Function may deploy before this is applied and the only
--   consequence is that the new verbs do nothing at all.
--
-- ── FAIL CLOSED ON A STALE hr_apply — READ THIS BEFORE APPLYING ─────────
-- §0 refuses to install against an hr_apply that lacks `intent_mismatch`, the
-- b346 slot scope, or `hr_day_budget_check`, and it is not being cautious:
--
--   · WITHOUT `intent_mismatch`, one client key reused for "buy 1 sword" then
--     "buy 5 swords" answers `replayed:true, ok:true` — the player is charged
--     for one and their client believes it bought five. `journal.intent` names
--     the offer AND the count precisely so that comparison can fire.
--   · WITHOUT the slot scope (v_prev_slot), one key spends on slot 0 and then
--     silently applies NOTHING on slot 1 while answering ok:true. Measured on
--     production 2026-08-15, rolled back.
--   · WITHOUT `hr_day_budget_check`, `vendor_sell` is an unmetered gold faucet
--     bounded only by the 50,000,000 per-call clamp. It is the first
--     client-reachable mint in this program and the day ceiling is its fuse.
--
-- SAFE TO RE-RUN. Additive and idempotent: one `create or replace function`,
-- one revoke/grant pair, and self-checks that clean up after themselves.
-- REVERSIBLE: re-apply 2026-08-15-activity-intent.sql to restore the previous
-- body verbatim (it is `create or replace` on the same signature), which
-- removes the `shop` bucket and makes both verbs inert again. Nothing here
-- creates a table, a column, a row, an index, a policy or a cron entry, and
-- nothing here touches hr_apply — so this file does NOT displace
-- 2026-08-15-tool-carry.sql as the last file that may replace it.
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
  if to_regclass('public.hr_items') is null then
    raise exception 'hr_items missing — apply 2026-08-11-catalogue.generated.sql first';
  end if;
  if (select count(*) from public.hr_items) = 0 then
    raise exception 'hr_items is EMPTY — every shop_buy grant and every vendor_sell would be '
                    'refused as unknown_item';
  end if;

  -- THE PROPERTIES OF hr_apply THESE TWO VERBS DEPEND ON.
  --
  -- ⚠ A prosrc scan is a text search, and a text search that has silently
  --   stopped matching passes forever. So it carries a CONTROL: a term that
  --   MUST be in any hr_apply worth the name. If the control is not found the
  --   scan is blind, and this file refuses rather than reporting a clean bill
  --   of health on a database it cannot read.
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';
  v_ctl := v_src ~ 'insufficient_gold';
  if not v_ctl then
    raise exception 'THE hr_apply SOURCE SCAN IS BLIND — the control term (insufficient_gold) is '
                    'absent from a % char body, so the three checks below would pass on any '
                    'database. Fix the scan, do not loosen it.', coalesce(length(v_src), 0);
  end if;
  if v_src !~ 'intent_mismatch' then
    raise exception 'hr_apply has NO intent_mismatch BRANCH. These verbs hand the client an intent '
                    'id for a VALUE TRANSFER; without that branch one key reused for two different '
                    'purchases hands back the first decision and the player is charged once for '
                    'what their client believes it bought twice (review S6). Apply '
                    '2026-08-11-apply-engine.sql first.';
  end if;
  if v_src !~ 'v_prev_slot' then
    raise exception 'hr_apply does NOT compare player_intents.slot (review C3). One key would then '
                    'mean one thing across every character on the account: a spend on slot 0 '
                    'replayed on slot 1 answers ok:true and applies NOTHING, silently, on the '
                    'character the player is looking at. Apply '
                    '2026-08-15-intent-key-hygiene.sql first.';
  end if;
  if v_src !~ 'hr_day_budget_check' then
    raise exception 'hr_apply does NOT call hr_day_budget_check (C5/X3). vendor_sell is the first '
                    'client-reachable path that MINTS gold and the daily gross-inflow ceiling is '
                    'its only fuse above the per-call clamp. Apply 2026-08-11-daily-budget.sql and '
                    '2026-08-11-apply-engine.sql first.';
  end if;
end $$;

-- ── 1. hr_rate_gate — one bucket added ───────────────────────────────────
-- Unchanged from 2026-08-15-activity-intent.sql except for the `shop` arm. The
-- whole body is restated rather than patched because `create or replace` is the
-- only way to change it and a diff-shaped migration does not exist in SQL; read
-- 2026-08-11-accrue-gate.sql's header for why the limit lives here instead of
-- being an argument (a caller that names its own rate limit does not have one).
create or replace function public.hr_rate_gate(p_user uuid, p_slot int, p_bucket text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_limit  int;
  v_window interval;
  v_weight bigint;
begin
  if p_user is null then return false; end if;

  -- THE ALLOWLIST AND THE LIMITS. Server-owned, all of them. An unknown bucket
  -- is refused rather than defaulted: a typo in a caller must not silently
  -- create a brand-new, unlimited counter namespace.
  case p_bucket
    when 'accrue'   then v_limit := 30; v_window := interval '1 minute';
    -- b345. Matches `accrue` deliberately: set_activity runs a COLLECT apply
    -- and a SWITCH apply, so it is strictly more expensive per call and must
    -- not be the looser budget of the two.
    when 'activity' then v_limit := 30; v_window := interval '1 minute';
    -- b351. shop_buy AND vendor_sell, sharing one counter: they are one
    -- surface. Matches the other two rather than being looser, even though a
    -- spend is one apply — a shop verb moves VALUE, and the conservative
    -- number is the one that does not have to be argued down later.
    when 'shop'     then v_limit := 30; v_window := interval '1 minute';
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
    raise exception 'hr_engine cannot execute hr_rate_gate — the shop path would be ungated';
  end if;

  -- (B) hr_rate_ok STAYS unreachable by everyone, hr_engine included. If the
  --     engine could call it, the engine would name its own limit and all three
  --     buckets above become decoration.
  select string_agg(r, ', ') into v_bad
    from unnest(array['public','anon','authenticated','service_role','hr_engine']) r
   where has_function_privilege(r, 'public.hr_rate_ok(uuid,text,int,interval)', 'execute');
  if v_bad is not null then
    raise exception 'hr_rate_ok is executable by: % — the limit would become a caller argument', v_bad;
  end if;

  -- (C) THE NEW BUCKET WORKS, AND BOTH OLD ONES STILL DO.
  --     A random uuid has no counter row, so this is a self-contained fixture.
  if public.hr_rate_gate(v_u, 0, 'not_a_bucket') then
    raise exception 'hr_rate_gate admitted an unknown bucket — it must fail closed';
  end if;
  if not public.hr_rate_gate(v_u, 0, 'shop') then
    raise exception 'hr_rate_gate refused the first shop call';
  end if;
  -- REGRESSION CONTROL: this file rewrites the whole body, so the pre-existing
  -- buckets are exactly the thing a careless edit would drop. This is the
  -- clan_members "join as self" defect in miniature — three files defining one
  -- object, and the one that applies last wins silently.
  if not public.hr_rate_gate(v_u, 0, 'accrue') then
    raise exception 'hr_rate_gate refused an accrue call — this rewrite dropped the accrual budget';
  end if;
  if not public.hr_rate_gate(v_u, 0, 'activity') then
    raise exception 'hr_rate_gate refused an activity call — this rewrite dropped the b345 bucket, '
                    'which would take the activity intent offline';
  end if;

  -- (D) THE LIMIT IS APPLIED, and it is per-bucket rather than shared.
  for i in 1..40 loop
    if public.hr_rate_gate(v_u, 0, 'shop') then v_n := v_n + 1; end if;
  end loop;
  if v_n >= 40 then
    raise exception 'hr_rate_gate allowed % of 40 further shop calls — the limit is not applied', v_n;
  end if;
  -- ...and exhausting `shop` must not have exhausted the other two. Three
  -- budgets, three counters: if this fires, one bucket is starving the others,
  -- and a player buying seeds would stop accruing their night.
  if not public.hr_rate_gate(v_u, 0, 'accrue') then
    raise exception 'exhausting the shop bucket also exhausted accrue — the counters are shared, so '
                    'a shopping spree would take away the player''s offline progression';
  end if;
  if not public.hr_rate_gate(v_u, 0, 'activity') then
    raise exception 'exhausting the shop bucket also exhausted activity — the counters are shared';
  end if;
  if public.hr_rate_gate(null, 0, 'shop') then
    raise exception 'hr_rate_gate admitted a null user on the shop bucket';
  end if;

  delete from public.hr_rate_counters where user_id = v_u;
  delete from public.hr_rejections where user_id = v_u;

  raise notice 'hr_rate_gate: shop = 30/min added; accrue and activity intact; unknown buckets fail closed.';
end $$;

-- ── 4. THE HAZARD THESE VERBS EXIST TO REMOVE ────────────────────────────
-- Proven by EXECUTION against a real character, inside a subtransaction that is
-- rolled back to nothing.
--
-- The claim is not that hr_apply is wrong. It is that A GOLD MOVE IS ALREADY
-- FULLY SERVER-OWNED — the balance is a column no client may write, an overspend
-- is refused under the lock, and a mint is metered — so the ONLY thing standing
-- between the live client's `G.gold = 1e12` exploit and a correct economy is a
-- verb that names an offer instead of a price. Written down here, as an
-- executable claim, so that:
--
--   · a reviewer of supabase/functions/hr-accrue/shop-buy.js can see WHY the
--     verb does not check affordability itself;
--   · the day someone relaxes the overspend refusal, THIS file stops applying
--     instead of the Edge Function quietly proposing negative balances forever.
--
-- Skipped LOUDLY if the fixtures it needs are unavailable — never silently,
-- because a self-check that switches itself off is worse than no self-check.
do $$
declare
  v_uid   uuid := gen_random_uuid();
  v_slot  int  := 0;
  v_r     jsonb;
  v_ver   bigint;
  v_gold  bigint;
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
  if not exists (select 1 from public.hr_items where item_id = 'normal_log') then
    raise exception '§4 CANNOT RUN: hr_items has no normal_log — the catalogue is not the '
                    'generated one, so the probe below would prove nothing about real ids';
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
    select version, gold into v_ver, v_gold
      from public.player_state where user_id = v_uid and slot = v_slot;

    -- (a) CONTROL. A well-formed purchase-shaped delta APPLIES. Without this
    --     the refusals below would be indistinguishable from "hr_apply refuses
    --     everything on this database".
    v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
      jsonb_build_object(
        'gold', 500,
        'journal', jsonb_build_object('kind','shop','intent','§4:seed')));
    if v_r->>'ok' <> 'true' then
      raise exception '§4 CONTROL: a plain gold grant was refused (%) — every assertion below '
                      'would pass for the wrong reason', v_r;
    end if;
    v_ver := (v_r->>'version')::bigint;
    -- MEASURED, not assumed. hr_create_character's start kit already carries
    -- gold, so a hard-coded "expected 500" below would be an assertion about a
    -- database this file imagined.
    select gold into v_gold from public.player_state where user_id = v_uid and slot = v_slot;

    -- (b) THE OVERSPEND IS REFUSED UNDER THE LOCK. This is the answer
    --     shop_buy.js deliberately does NOT compute for itself.
    --     ⚠ DELIBERATELY INSIDE c_max_gold_delta (50,000,000). A bigger number
    --       comes back `gold_clamp` — "this ONE delta is insane" — which is a
    --       different refusal from "you cannot afford it", and asserting the
    --       wrong one here would leave the affordability branch unprobed while
    --       the block still passed.
    v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
      jsonb_build_object(
        'gold', -100000,
        'journal', jsonb_build_object('kind','shop','intent','§4:overspend')));
    if v_r->>'error' <> 'insufficient_gold' then
      raise exception '§4: spending 100,000 gold from a balance of 500 returned % — shop_buy relies '
                      'on this refusal being the ONE answer to "can they afford it"', v_r;
    end if;

    -- (c) A SALE OF AN ITEM THE PLAYER DOES NOT HAVE IS REFUSED. This is the
    --     answer vendor-sell.js deliberately does NOT compute for itself, and
    --     the reason it does not pre-read the inventory: that read is stale the
    --     instant it returns.
    v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
      jsonb_build_object(
        'gold', 100000,
        'items', jsonb_build_object('normal_log', -100000),
        'journal', jsonb_build_object('kind','shop','intent','§4:phantom_sale')));
    if v_r->>'error' <> 'insufficient_item' then
      raise exception '§4: selling 100,000 logs the character does not own returned % — a '
                      'vendor_sell would then MINT 100,000 gold out of nothing', v_r;
    end if;

    -- (d) AND THE GOLD DID NOT MOVE. A refusal that rolled back partially is
    --     the pre-hardening defect apply-engine's header describes.
    if (select gold from public.player_state where user_id = v_uid and slot = v_slot) <> v_gold then
      raise exception '§4: after two refusals the balance moved from % — a rejected delta left '
                      'value behind', v_gold;
    end if;

    raise notice '§4: overspend refused, phantom sale refused, balance intact at %.', v_gold;
    raise exception 'HR_ROLLBACK_§4';   -- the whole probe is discarded
  exception
    when others then
      if sqlerrm <> 'HR_ROLLBACK_§4' then raise; end if;
  end;

  raise notice '§4 complete — probe rolled back, zero residue.';
end $$;
