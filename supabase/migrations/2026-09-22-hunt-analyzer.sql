-- ════════════════════════════════════════════════════════════════════════════
-- RESTATEMENT-DEBT-ACK: adds 1 anchored patch to hr_state_of (chain depth 5 since the 2026-09-14 restatement). Same trade and the same exactly-once anchor assertion as the two files above it in this set; the spliced text is 4 lines. This is the THIRD hr_state_of patch in one lane, which is the strongest argument yet for the restatement this lane reports as owed - it should land before any further patch on that body.
-- 2026-09-22-hunt-analyzer.sql — THE READOUT IS ARITHMETIC OVER THE JOURNAL.
--
-- docs/design/HUNTS_AND_ANALYZER.md §3. `hr_hunt_analyzer(p_user, p_slot)`,
-- SECURITY DEFINER, read-only, mirroring `hr_bestiary_of`'s posture exactly.
--
-- ── THERE IS NO PER-HUNT COUNTER TABLE, AND THERE WILL NOT BE ONE ───────────
-- A counter table is a second copy of what the ledger already says, it needs a
-- reset on every way a hunt can start, and it can disagree with the journal —
-- which is "the browser says one thing, the server says another" in a new
-- costume (CLAUDE.md §6, Tyler 2026-09-14). The ledger is the record of truth
-- and this function is arithmetic over it.
--
-- ── WHERE EACH FIELD ACTUALLY COMES FROM ────────────────────────────────────
-- The design names the shorthand; this is the measured shape of the rows.
--   window rows   player_ledger kind='combat' AND intent='accrue'. accrual.js
--                 journals a combat settle as {kind:'combat', intent:'accrue'};
--                 'accrue rows' in the design means exactly these.
--   paid ms       meta->>'ms'      · kills  meta->>'kills'  · meals meta->>'ate'
--   gold          the `gold` COLUMN (hr_apply writes the delta's gold there)
--   items         meta->'delta'->'i' — hr_apply's SIGNED item map. POSITIVE is
--                 loot; NEGATIVE is what the night burned, because auto-eat and
--                 ammo both spend through the same fx.removeItem the loot
--                 credits through (src/core/ammo.js spendForSwings). So "loot
--                 value" and "supplies" are the two signs of ONE map, and
--                 nothing can be counted twice.
--   xp            meta->'delta'->'x', filtered to hr_skills.cat='combat' — the
--                 server's own definition of a combat skill, not a list here.
--   deaths        the ledger's OWN death rows (kind='combat', intent='death'),
--                 which hr_apply already fans out one per fall. The design says
--                 `meta->>'fell'`; the rows are better, because they exist
--                 already and adding a meta key to carry a number the journal
--                 states twice is the shape tests/accrual-engine.mjs's META_KEYS
--                 allowlist exists to refuse.
--   stopped       meta->>'stopped' on the LAST window — written by accrual.js
--                 when a stop rule fired.
--
-- ── THE LOWER BOUND IS STRICT (`at > active_since`), AND THAT IS A DECISION ──
-- The design writes `at >= active_since`. Measured in the replay: `now()` is the
-- TRANSACTION timestamp in Postgres, so a delta that both journals a settled
-- window AND moves the activity pointer stamps `active_since` to the SAME
-- instant the accrue row carries — and accrual.js emits exactly that shape when
-- a run ends (`delta.activity = {kind:'idle'}` beside the window that paid for
-- it). Under `>=` that window would be read as the FIRST window of the NEXT
-- hunt, so a player who restarted a hunt would see the previous night's kills
-- on a fresh Analyzer. `>` says the honest thing: a window credited in the
-- transaction that (re)started the hunt belongs to the hunt it ended.
-- §3(c6) is the executable proof, and it was RED before this line changed.
--
-- ── VENDOR VALUE, NEVER A MARKET PRICE (design §3, note 2) ──────────────────
-- `hr_items.value` is a catalogue constant. A market price is player-influenced,
-- and putting one inside a rate players optimise against invites wash trading to
-- inflate a leaderboard-adjacent readout. The panel says "vendor value" in so
-- many words so nobody reads it as a quote.
--
-- ── PROFIT/H DIVIDES BY ELAPSED, NOT PAID (design §3, note 3) ───────────────
-- A hunt that pays well while swinging and spends half its night knocked out is
-- not profitable, and the number a player uses to choose a spawn must not hide
-- that. RAW XP/h (over paid time) is reported BESIDE effective XP/h (over
-- elapsed) because the GAP is the diagnosis.
--
-- ── WHAT A FORGED CALL CAN DO: NOTHING ──────────────────────────────────────
-- It writes no row, so it cannot be replayed into a gain, and it takes a user
-- and a slot and nothing else — a forged call returns another shape of the
-- caller's own data. Every counter it reads was written by hr_apply out of a
-- SETTLED window; there is no client kill count, no client timer and no client
-- loot value anywhere in it (design §5).
--
-- ── THE SCAN IS BOUNDED BY DESIGN ───────────────────────────────────────────
-- player_ledger_user_idx (user_id, slot, at desc) already exists, and a hunt is
-- bounded below by `active_since` and above by ACCRUE_MAX_SPAN_MS (24 h) per
-- window. Computed ONLY when the character is actually on a combat pointer, so
-- it costs every other envelope nothing.
--
-- LANE C. STAGED, NOT APPLIED. Read-only, but it reads the money journal, so it
-- takes the Security review with the rest of the set.
--
-- REVERSIBILITY
--   drop function public.hr_hunt_analyzer(uuid,int);
--   -- re-apply 2026-09-14-hr-state-of-restatement.sql to drop the projection.
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.player_ledger') is null then raise exception 'player_ledger is missing'; end if;
  if to_regclass('public.hr_items')  is null then raise exception 'hr_items is missing - apply 2026-08-11-catalogue.generated.sql FIRST'; end if;
  if to_regclass('public.hr_skills') is null then raise exception 'hr_skills is missing'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_state' and column_name='hunt_stance') then
    raise exception 'PRECONDITION: player_state.hunt_stance is absent - apply 2026-09-22-hunt-stance-stop.sql FIRST'; end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then raise exception 'hr_state_of is absent'; end if;
end $$;

-- ── 1. hr_hunt_analyzer ────────────────────────────────────────────────────
create or replace function public.hr_hunt_analyzer(p_user uuid, p_slot int default 0)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_catalog as $$
declare
  v_st        public.player_state%rowtype;
  v_now       timestamptz := now();
  v_elapsed   bigint;
  v_paid      bigint := 0;
  v_kills     bigint := 0;
  v_gold      bigint := 0;
  v_ate       bigint := 0;
  v_windows   bigint := 0;
  v_trunc     bigint := 0;
  v_loot      bigint := 0;
  v_supplies  bigint := 0;
  v_xp        bigint := 0;
  v_deaths    bigint := 0;
  v_stopped   text;
  v_settled   timestamptz;
  v_profit    bigint;
  v_h_elapsed numeric;
  v_h_paid    numeric;
begin
  if p_user is null then return null; end if;
  select * into v_st from public.player_state
   where user_id = p_user and slot = coalesce(p_slot, 0);
  if v_st.user_id is null then return null; end if;

  -- NOT ON A HUNT -> NOT AN ANALYZER. `null`, not a zeroed object: a zero is a
  -- claim and an absent block is the truth (HUNT_ANALYZER_UI.md §3, which
  -- renders em-dashes rather than zeroes for exactly this reason).
  if v_st.active_kind is distinct from 'combat' or v_st.active_since is null then
    return null;
  end if;

  v_elapsed := greatest(0, (extract(epoch from (v_now - v_st.active_since)) * 1000)::bigint);

  -- (1) THE WINDOW ROWS, in one pass.
  select coalesce(sum(coalesce((l.meta->>'ms')::bigint, 0)), 0),
         coalesce(sum(coalesce((l.meta->>'kills')::bigint, 0)), 0),
         coalesce(sum(coalesce(l.gold, 0)), 0),
         coalesce(sum(coalesce((l.meta->>'ate')::bigint, 0)), 0),
         count(*),
         -- Windows whose item map hr_apply SUMMARISED because it named more than
         -- 24 kinds. Reported rather than silently under-counted: a loot total
         -- that quietly omits a window is the same defect class as a payment the
         -- player is never told about.
         coalesce(sum(case when (l.meta->'delta') ? 'i_n' then 1 else 0 end), 0),
         max(l.at)
    into v_paid, v_kills, v_gold, v_ate, v_windows, v_trunc, v_settled
    from public.player_ledger l
   where l.user_id = p_user and l.slot = coalesce(p_slot, 0)
     and l.kind = 'combat' and l.intent = 'accrue'
     and l.at > v_st.active_since;

  -- (2) THE SIGNED ITEM MAP, both signs, priced from the SEALED CATALOGUE.
  --     An item the catalogue does not know prices at 0 rather than aborting:
  --     a readout must not fail because a row was retired.
  select coalesce(sum(case when q.qty > 0 then q.qty * coalesce(i.value, 0) else 0 end), 0),
         coalesce(sum(case when q.qty < 0 then (-q.qty) * coalesce(i.value, 0) else 0 end), 0)
    into v_loot, v_supplies
    from public.player_ledger l
    cross join lateral jsonb_each_text(coalesce(l.meta->'delta'->'i', '{}'::jsonb))
                 as e(item_id, qty_text)
    cross join lateral (select coalesce(nullif(e.qty_text,'')::bigint, 0) as qty) q
    left join public.hr_items i on i.item_id = e.item_id
   where l.user_id = p_user and l.slot = coalesce(p_slot, 0)
     and l.kind = 'combat' and l.intent = 'accrue'
     and l.at > v_st.active_since;

  -- (3) COMBAT XP ONLY, and `combat` is the CATALOGUE's answer (hr_skills.cat),
  --     never a list typed here. A night that levelled Cooking off a drop does
  --     not inflate a combat rate.
  select coalesce(sum(coalesce(nullif(e.amount,'')::bigint, 0)), 0)
    into v_xp
    from public.player_ledger l
    cross join lateral jsonb_each_text(coalesce(l.meta->'delta'->'x', '{}'::jsonb))
                 as e(skill_id, amount)
    join public.hr_skills s on s.skill_id = e.skill_id and s.cat = 'combat'
   where l.user_id = p_user and l.slot = coalesce(p_slot, 0)
     and l.kind = 'combat' and l.intent = 'accrue'
     and l.at > v_st.active_since;

  -- (4) DEATHS, from the rows hr_apply already fans out one per fall.
  select count(*) into v_deaths from public.player_ledger l
   where l.user_id = p_user and l.slot = coalesce(p_slot, 0)
     and l.kind = 'combat' and l.intent = 'death'
     and l.at > v_st.active_since;

  -- (5) WHICH RULE ENDED THE LAST WINDOW, if any.
  select l.meta->>'stopped' into v_stopped from public.player_ledger l
   where l.user_id = p_user and l.slot = coalesce(p_slot, 0)
     and l.kind = 'combat' and l.intent = 'accrue'
     and l.at > v_st.active_since
   order by l.at desc, l.id desc limit 1;

  v_profit    := v_gold + v_loot - v_supplies;
  v_h_elapsed := v_elapsed::numeric / 3600000;
  v_h_paid    := v_paid::numeric / 3600000;

  return jsonb_build_object(
    -- WHAT IS RUNNING. The display NAME is the client's to render off its own
    -- MONSTERS catalogue - it is a label, not a value a player can act on.
    'spawn_id',      v_st.active_id,
    'stance',        coalesce(v_st.hunt_stance, 'steady'),
    'stop',          v_st.hunt_stop,
    'started_at',    v_st.active_since,
    'elapsed_ms',    v_elapsed,
    'paid_ms',       v_paid,
    -- ELAPSED MINUS PAID: recovery, refusals and dry windows. The number that
    -- tells a player their stance or their supplies are wrong.
    'downtime_ms',   greatest(0, v_elapsed - v_paid),
    'windows',       v_windows,
    'kills',         v_kills,
    'deaths',        v_deaths,
    'meals',         v_ate,
    'gold',          v_gold,
    'loot_value',    v_loot,
    'supplies_value',v_supplies,
    'profit',        v_profit,
    'combat_xp',     v_xp,
    -- THE RATES. `null` rather than 0 when the denominator is 0 - a zero is a
    -- claim, and the panel renders an em-dash for "nothing settled yet".
    'xp_per_h',      case when v_h_elapsed > 0 then round(v_xp    / v_h_elapsed) end,
    'raw_xp_per_h',  case when v_h_paid    > 0 then round(v_xp    / v_h_paid)    end,
    'kills_per_h',   case when v_h_elapsed > 0 then round(v_kills / v_h_elapsed) end,
    'profit_per_h',  case when v_h_elapsed > 0 then round(v_profit/ v_h_elapsed) end,
    'stopped',       v_stopped,
    -- THE HONESTY LINE (HUNT_ANALYZER_UI.md §F). Never omitted: every number
    -- above it is the server's LAST SETTLED projection, and the panel prints
    -- when that was so a player who reloads twice inside one window sees the
    -- same numbers both times and understands why.
    'settled_at',    v_settled,
    'server_now',    v_now,
    -- Honest about its own blind spot (see the i_n note above).
    'items_truncated_windows', v_trunc);
end $$;

comment on function public.hr_hunt_analyzer(uuid, int) is
  'THE HUNT ANALYZER (2026-09-22). Arithmetic over player_ledger accrue rows since player_state.active_since. READ-ONLY: writes no row, so it cannot be replayed into a gain. Loot is priced from hr_items.value (VENDOR value, a catalogue constant - never a market price, which a player could wash-trade to inflate a rate). Combat XP is filtered by hr_skills.cat. Profit/h divides by ELAPSED, not paid. There is deliberately no per-hunt counter table.';

revoke execute on function public.hr_hunt_analyzer(uuid, int) from public;
revoke execute on function public.hr_hunt_analyzer(uuid, int) from anon, authenticated, service_role;
grant  execute on function public.hr_hunt_analyzer(uuid, int) to hr_engine;

-- ── 2. hr_state_of — PROJECT the block ─────────────────────────────────────
-- HUNT_ANALYZER_UI.md §6: "It introduces NO read of its own - a screen that
-- needs a new RPC to render is a screen that has grown a second model." The
-- block rides the envelope and is REPLACED on every one (CLAUDE.md §6); it is
-- `null` for every character not on a combat pointer, which is what keeps it
-- free for the rest of the game.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$'total_level', public.hr_total_level(p_user, v_st.slot),$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'hunt_analyzer', public.hr_hunt_analyzer$q$) > 0 then
    raise notice 'hr_state_of already projects hunt_analyzer - patch skipped'; return; end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_state_of total_level anchor did not match exactly once - refusing to patch a body this file cannot account for.';
  end if;
  v_def := replace(v_def, c_anchor, c_anchor || $new$
    -- hunt-analyzer (2026-09-22): the last settled reading of the running hunt,
    -- or NULL when this character is not on a combat pointer. Nothing here is
    -- extrapolated between settles and nothing is merged upward.
    'hunt_analyzer', public.hr_hunt_analyzer(p_user, v_st.slot),$new$);
  execute v_def;
  raise notice 'hr_state_of patched: the envelope carries the hunt analyzer';
end $$;
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 3. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
do $$
declare
  v_uid constant uuid := '00000000-0000-4000-8000-0000b5510003';
  v_a     jsonb;
  v_r     jsonb;
  v_src   text;
  -- ⚠ THE TWO PROBE ITEMS ARE DERIVED FROM THE CATALOGUE, NEVER TYPED. The
  --   first draft named 'bronze_arrow', which is not a row - so the gate failed
  --   on its own fixture rather than on the property. An id read out of hr_items
  --   cannot rot when the catalogue is regenerated, and `order by item_id` makes
  --   the choice deterministic so two replays assert the same arithmetic.
  v_loot  text;
  v_ammo  text;
  v_lootv bigint;
  v_ammov bigint;
begin
  -- (a) IT IS A READ. No INSERT/UPDATE/DELETE may appear in the body at all -
  --     that is what makes "a forged call cannot be replayed into a gain" a
  --     property rather than a claim. Comments stripped first.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='hr_hunt_analyzer';
  if v_src is null then raise exception 'GATE(a): hr_hunt_analyzer is missing'; end if;
  if v_src ~* '(^|[^a-z_])(insert|update|delete|truncate)([^a-z_]|$)' then
    raise exception 'GATE(a): hr_hunt_analyzer contains a write - the Analyzer is a READ';
  end if;
  if (select provolatile from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='hr_hunt_analyzer') <> 's' then
    raise exception 'GATE(a): hr_hunt_analyzer is not STABLE';
  end if;

  -- (b) THE PRICE IS THE SEALED CATALOGUE, AND IT IS NOT A MARKET PRICE.
  if position('hr_items' in v_src) = 0 then
    raise exception 'GATE(b): the Analyzer does not price loot from hr_items - where is the value coming from?';
  end if;
  if v_src ~* 'market' then
    raise exception 'GATE(b): the Analyzer reads a market surface - vendor value only (design 3 note 2)';
  end if;
  -- (b2) COMBAT XP IS THE CATALOGUE'S ANSWER, NOT A LIST TYPED HERE.
  if position('hr_skills' in v_src) = 0 then
    raise exception 'GATE(b2): the Analyzer does not consult hr_skills - the combat-skill set has become a second copy';
  end if;

  select item_id, value into v_loot, v_lootv from public.hr_items
   where kind is distinct from 'ammo' and value > 0 order by item_id limit 1;
  select item_id, value into v_ammo, v_ammov from public.hr_items
   where kind = 'ammo' and value > 0 order by item_id limit 1;
  if v_loot is null or v_ammo is null then
    raise exception 'GATE(b3): the catalogue has no priced loot row and/or no priced ammo row - this gate cannot prove the two signs of the item map';
  end if;

  begin  -- ── SUBTRANSACTION ────────────────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(c): no probe character: %', v_r; end if;

    -- (c1) NOT HUNTING -> NULL. A zero would be a claim.
    if public.hr_hunt_analyzer(v_uid, 0) is not null then
      raise exception 'GATE(c1): an idle character got an Analyzer block - a zeroed readout is a claim about a hunt that never ran';
    end if;

    -- (c2) ON A HUNT WITH NOTHING SETTLED -> a block whose rates are NULL.
    v_r := public.hr_apply(v_uid, 0, (public.hr_state_of(v_uid,0)->>'version')::bigint,
      gen_random_uuid(), jsonb_build_object(
        'activity', jsonb_build_object('kind','combat','id','goblin','restart',true),
        'journal',  jsonb_build_object('kind','admin','intent','set_activity:combat:goblin')));
    if coalesce(v_r->>'ok','false') <> 'true' then raise exception 'GATE(c2): could not start the probe hunt: %', v_r; end if;
    -- ⚠ BACK-DATE THE PROBE HUNT BY TWO HOURS, on this probe's OWN row.
    --   Everything in a migration runs in ONE transaction and `now()` is the
    --   TRANSACTION timestamp, so without this every fixture row and
    --   `active_since` share one instant and neither the elapsed-time rates nor
    --   the lower-bound rule below could be exercised at all. Two hours of
    --   elapsed against one hour of paid is also what makes raw XP/h and
    --   effective XP/h genuinely different numbers at (c3).
    update public.player_state set active_since = now() - interval '2 hours'
     where user_id = v_uid and slot = 0;
    v_a := public.hr_hunt_analyzer(v_uid, 0);
    if v_a is null then raise exception 'GATE(c2): a running hunt got no Analyzer block'; end if;
    if (v_a->>'kills')::bigint <> 0 or (v_a->>'windows')::bigint <> 0 then
      raise exception 'GATE(c2): an unsettled hunt already counts something: %', v_a; end if;
    if (v_a->'raw_xp_per_h') <> 'null'::jsonb then
      raise exception 'GATE(c2): raw XP/h is % with no paid time - it must be null, because a zero rate is a claim', v_a->'raw_xp_per_h'; end if;
    if (v_a->>'settled_at') is not null then
      raise exception 'GATE(c2): the honesty line names a settle that never happened'; end if;

    -- (c3-pre) STOCK THE QUIVER. hr_apply refuses an item delta that would take
    --      a stack below zero - correctly - so the burn the next window journals
    --      has to be a burn of something the character actually held. Journalled
    --      under kind='admin', which the Analyzer does not read, so this setup
    --      cannot contribute to the sums (c3) then asserts.
    v_r := public.hr_apply(v_uid, 0, (public.hr_state_of(v_uid,0)->>'version')::bigint,
      gen_random_uuid(), jsonb_build_object(
        'items', jsonb_build_object(v_ammo, 40),
        'journal', jsonb_build_object('kind','admin','intent','analyzer_probe_stock')));
    if coalesce(v_r->>'ok','false') <> 'true' then raise exception 'GATE(c3-pre): could not stock the probe quiver: %', v_r; end if;

    -- (c3) ONE SETTLED WINDOW, AND EVERY FIELD IS THE HAND-COMPUTED SUM.
    --      The delta below is the shape accrual.js proposes for a combat window:
    --      gold, an xp map, a SIGNED item map (loot positive, supplies negative)
    --      and the journal's aggregate meta.
    v_r := public.hr_apply(v_uid, 0, (public.hr_state_of(v_uid,0)->>'version')::bigint,
      gen_random_uuid(), jsonb_build_object(
        'gold',  1000,
        'xp',    jsonb_build_object('attack', 500, 'cooking', 900),
        'items', jsonb_build_object(v_loot, 10, v_ammo, -40),
        'journal', jsonb_build_object('kind','combat','intent','accrue',
          'meta', jsonb_build_object('ms', 3600000, 'kills', 200, 'ate', 3, 'ticks', 1500, 'capped', false))));
    if coalesce(v_r->>'ok','false') <> 'true' then raise exception 'GATE(c3): the probe window was refused: %', v_r; end if;

    v_a := public.hr_hunt_analyzer(v_uid, 0);
    if (v_a->>'windows')::bigint <> 1 then raise exception 'GATE(c3): % windows, expected 1', v_a->>'windows'; end if;
    if (v_a->>'paid_ms')::bigint <> 3600000 then raise exception 'GATE(c3): paid_ms is %', v_a->>'paid_ms'; end if;
    if (v_a->>'kills')::bigint  <> 200  then raise exception 'GATE(c3): kills is %', v_a->>'kills'; end if;
    if (v_a->>'gold')::bigint   <> 1000 then raise exception 'GATE(c3): gold is %', v_a->>'gold'; end if;
    if (v_a->>'meals')::bigint  <> 3    then raise exception 'GATE(c3): meals is %', v_a->>'meals'; end if;
    -- COMBAT XP ONLY: the 900 Cooking XP must NOT be in the combat rate.
    if (v_a->>'combat_xp')::bigint <> 500 then
      raise exception 'GATE(c3): combat_xp is % - non-combat XP is inflating the rate', v_a->>'combat_xp'; end if;
    -- LOOT AND SUPPLIES ARE THE TWO SIGNS OF ONE MAP, priced from the catalogue.
    if (v_a->>'loot_value')::bigint <> 10 * v_lootv then
      raise exception 'GATE(c3): loot_value is % - it is not 10 x the catalogue value of % (%)', v_a->>'loot_value', v_loot, v_lootv; end if;
    if (v_a->>'supplies_value')::bigint <> 40 * v_ammov then
      raise exception 'GATE(c3): supplies_value is % - the NEGATIVE side of the item map is not being read as the night''s burn', v_a->>'supplies_value'; end if;
    if (v_a->>'profit')::bigint
         <> (v_a->>'gold')::bigint + (v_a->>'loot_value')::bigint - (v_a->>'supplies_value')::bigint then
      raise exception 'GATE(c3): profit is not gold + loot - supplies'; end if;
    if (v_a->>'settled_at') is null then raise exception 'GATE(c3): the honesty line is empty after a settle'; end if;
    -- RAW vs EFFECTIVE: raw divides by PAID, effective by ELAPSED, and elapsed
    -- is larger here (the probe hunt started before the window was journalled),
    -- so raw must be the HIGHER of the two. The GAP is the whole diagnosis.
    if (v_a->>'raw_xp_per_h')::numeric < (v_a->>'xp_per_h')::numeric then
      raise exception 'GATE(c3): raw XP/h (%) is below effective (%) - the two denominators have been swapped',
        v_a->>'raw_xp_per_h', v_a->>'xp_per_h'; end if;

    -- (c4) A SECOND WINDOW SUMS. Nothing here is a counter that could be reset.
    v_r := public.hr_apply(v_uid, 0, (public.hr_state_of(v_uid,0)->>'version')::bigint,
      gen_random_uuid(), jsonb_build_object(
        'gold', 500, 'items', jsonb_build_object(v_loot, 5),
        'journal', jsonb_build_object('kind','combat','intent','accrue',
          'meta', jsonb_build_object('ms', 1800000, 'kills', 100, 'ate', 1,
                                     'stopped', 'bag_full'))));
    if coalesce(v_r->>'ok','false') <> 'true' then raise exception 'GATE(c4): the second window was refused: %', v_r; end if;
    v_a := public.hr_hunt_analyzer(v_uid, 0);
    if (v_a->>'kills')::bigint <> 300 or (v_a->>'gold')::bigint <> 1500
       or (v_a->>'paid_ms')::bigint <> 5400000 then
      raise exception 'GATE(c4): the second window did not SUM: %', v_a; end if;
    if v_a->>'stopped' is distinct from 'bag_full' then
      raise exception 'GATE(c4): the LAST window''s stop rule is % - the panel would name the wrong reason', v_a->>'stopped'; end if;

    -- (c5) A DEATH ROW IS COUNTED, AND IT IS THE LEDGER'S OWN ROW.
    v_r := public.hr_apply(v_uid, 0, (public.hr_state_of(v_uid,0)->>'version')::bigint,
      gen_random_uuid(), jsonb_build_object(
        'deaths', jsonb_build_array(jsonb_build_object(
          'monster','goblin','recovery_ms',120000,'deaths_today',1,'deaths_lifetime',1,
          'resume_hp',4,'auto_eat_enabled',false,'food_in_bag',false)),
        'journal', jsonb_build_object('kind','combat','intent','accrue',
          'meta', jsonb_build_object('ms', 0, 'kills', 0))));
    if coalesce(v_r->>'ok','false') <> 'true' then raise exception 'GATE(c5): the death row was refused: %', v_r; end if;
    if (public.hr_hunt_analyzer(v_uid, 0)->>'deaths')::bigint <> 1 then
      raise exception 'GATE(c5): the fall was not counted'; end if;

    -- (c6) RESTARTING THE HUNT RESETS THE READING, WITHOUT RESETTING ANYTHING.
    --      `active_since` moves; the ledger is untouched; the Analyzer forgets
    --      the previous night because it only ever looked forward from that
    --      instant. THIS is why there is no counter table to reset.
    v_r := public.hr_apply(v_uid, 0, (public.hr_state_of(v_uid,0)->>'version')::bigint,
      gen_random_uuid(), jsonb_build_object(
        'activity', jsonb_build_object('kind','combat','id','goblin','restart',true),
        'journal',  jsonb_build_object('kind','admin','intent','set_activity:combat:goblin')));
    if coalesce(v_r->>'ok','false') <> 'true' then raise exception 'GATE(c6): the restart was refused: %', v_r; end if;
    v_a := public.hr_hunt_analyzer(v_uid, 0);
    if (v_a->>'kills')::bigint <> 0 or (v_a->>'windows')::bigint <> 0 then
      raise exception 'GATE(c6): a restarted hunt still reads the previous night: %', v_a; end if;
    if (select count(*) from public.player_ledger
         where user_id = v_uid and kind='combat' and intent='accrue') <> 3 then
      raise exception 'GATE(c6): the restart DELETED journal rows - the Analyzer forgets, the ledger does not';
    end if;

    -- (c7) THE ENVELOPE CARRIES THE SAME BLOCK.
    if (public.hr_state_of(v_uid, 0)->'hunt_analyzer') is distinct from v_a then
      raise exception 'GATE(c7): hr_state_of and hr_hunt_analyzer disagree';
    end if;

    raise exception using errcode = 'HR922', message = 'hunt-analyzer §3 complete - rolling back';
  exception when sqlstate 'HR922' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state     where user_id = v_uid)
     or exists (select 1 from public.player_skills    where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_equipment where user_id = v_uid)
     or exists (select 1 from public.player_progress  where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from auth.users             where id = v_uid) then
    raise exception 'GATE: §3 LEAKED a probe row';
  end if;

  raise notice 'hunt-analyzer: the Analyzer writes nothing, prices loot from the sealed catalogue and never a market, asks hr_skills which skills are combat, and EXECUTED - an idle character gets null, an unsettled hunt gets null rates, one window equals the hand-computed sums, a second window sums, a fall is counted, a restart forgets the night WITHOUT deleting a journal row, and the envelope agrees - all green, net zero';
end $$;
