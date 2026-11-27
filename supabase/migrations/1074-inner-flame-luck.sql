-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1074-inner-flame-luck.sql — THE INNER FLAME AS LUCK, IN THE SETTLE: the hunt's own Remains go on the company's fire
--   by the stoke rule, the fire burns down by hunted hero-time on the window's own clock, and each hunt rolls its Rares at the flame it
--   started with (lane/f1-inner-flame, backend-architect, 2026-11-26; docs/design/redesign/20-v030-the-roads.md section 4 Band 3 F1,
--   21-flame-temper-imbue-loot.md section 1, 12-targets.md 8.6 / 8.6.1, 19-power-ledger.md row 11, 13-security-list.md N-5 / S-29).
--
-- STATUS: supabase/migration-notes/1074-inner-flame-luck.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1063-flame-temper.sql (company_flame, the twins) and
--   1071-trait-pieces.sql (the restated hr_hunt_instance_read and hr_hunt_apply_instance this file splices, hr_trait_drops_of).
--   Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §9 self-check.
-- RESTATEMENT-DEBT-ACK: three anchored edits of hr_hunt_apply_instance and one of hr_hunt_instance_read, both restated whole by 1071-trait-pieces.sql (depth 0 to 1); kept as splices so lane/retire-tier-chain's in-place edits of the same 1071 bodies merge with no re-derivation. The next lane that touches either body restates it whole.
--
-- ── WHY THE SETTLE WALKS THE FIRE (the architecture) ──────────────────────────
-- 1063 decayed the fire by a trigger on each session's settled_to and 1071 handed the roller the luck of the height at each window's
-- START. Both made the result depend on where the settles cut the hunt: a watched hunt settles at other instants than a closed one, so it
-- read other luck, and a burn of the window's Remains at its end decays from another instant. CLAUDE.md section 6 (one engine, identical
-- online and offline) refuses that. So:
--   LUCK IS FROZEN PER HUNT: a hunt session rolls its Rares at the luck of the company's height when the session began (hunt_flame,
--     written by the insert trigger hr_flame_session_freeze). The return card and the hunt say "Rare chance +26%" and it holds for that
--     hunt. A burn, a stoke or a decay moves the NEXT hunt's luck, never the running one (CONFLICTS 2026-11-27 F1, the designer's to rule).
--   THE FIRE WALKS ON THE WINDOW'S CLOCK (hr_flame_walk, the twin of src/core/inner-flame.js walk): the engine names each Remains a hero
--     picked up and when (a member's `flame` claim: [[at_ms, seq, item, qty], ...], the engine's own order), and the server walks the
--     company's fire across the window: every hunted hero-minute that ended by a drop's instant burns the height down first, then the drop
--     goes on the fire up to the stoke rule's share of the room, and what does not fit stays in the bag. The walk is resumable, so any cut
--     of the windows stores the same fire (tests/flame-settle-db.mjs FS-3, tests/flame-rules.mjs FR-WALK).
--   THE DEFAULT STOKE RULE is company_flame.stoke's column default, `Keep full` (21 section 1.9 step 3): a company that never set one
--     burns its own Remains to the room. `Off` burns nothing and the fire only burns down.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- TABLE hunt_flame (RLS on; the account reads its own rows; NO client write; the insert trigger and the settle's walk are the only writers):
--   session_id (pk, a hunt session) · user_id · slot · luck_pm (the luck the hunt rolls at, permille) · top (the company's highest hero
--   Level when it began: the fuel's worth reads it, frozen so a Level gained mid-hunt never moves a cut) · units (Remains it burned) ·
--   burned { item: units } · created_at.
-- THE READ (hr_hunt_instance_read, ONE SPLICE): instance `flame` = the hr_flame_fuel items, null while inner_flame is off: the edge notes
--   only those, and sends each member's claim only then.
--   hr_trait_drops_of (RESTATED WHOLE): `luck_pm` is the member's session's frozen luck (0 while inner_flame is off or none was frozen).
-- THE COMMIT (hr_hunt_apply_instance, THREE SPLICES): a member may carry `flame` [[at_ms, seq, item, qty], ...]. Before any member lands,
--   under every hero lock and purse, hr_flame_settle re-proves every claim and walks each company's fire once (the flame row FOR UPDATE,
--   after the purses: the burn verb takes hero, then flame, so no cycle exists); each member's delta then lands NET of what it burned
--   (hr_flame_net), its one ledger row carrying meta.flame { burned }. Refusals (HR000, counted on the seat like any other):
--     flame_dark      a claim while inner_flame is off
--     bad_flame       shape: not an array, an entry not [whole ms, whole seq, item, whole qty >= 1], more than c_claims_max entries
--     flame_order     a seq used twice across the whole settle (the engine numbers every drop of the window once, in its own order)
--     flame_when      a drop outside its hero's hunted span [settled_to before, the member's window end]
--     flame_over      a member claims more of an item than its delta carries (the claim is a subset of the window's own loot)
--   A claim whose gross is more than the member's journalled kills times the most the ground drops of it in one kill (hr_flame_fuel_cap)
--   burns NOTHING: the gross then reaches hr_hunt_apply_member whole, whose own item bound judges it (a called room, which journals no
--   kill, keeps its Remains in the bag). So a burn can never carry an item past the bound a bag credit has.
-- THE SECTION `flame` (hr_flame_view, RESTATED WHOLE): adds `hunts` [{ session, slot, luck_pm, units }], the account's eight newest hunts
--   (the return card's line, "Flame: burned 41 Remains · Rare chance +26%").
-- THE TRIGGER hr_flame_temper_settle (RESTATED WHOLE): the imbuement timers only; the fire is the walk's alone (a reset that moves a
--   session's settled_to forward no longer burns the fire as if it had hunted).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The walk runs inside hr_hunt_apply_instance's one subtransaction under its instance lock, every member's hr_hunt_lock and every
-- account's purse; it takes company_flame FOR UPDATE after them (house order: hero, purse, flame, then the bag rows hr_apply writes).
-- hr_flame_burn takes hero, flame, bag; hr_flame_stoke_set the flame alone; two settles of one account queue on its purse. A replayed
-- commit stops at the instance's world CAS before the walk. A refusal anywhere rolls the walk back with the members. The burned map is
-- settle-local (hr.flame_burned, set by the walk before the member loop, read by hr_flame_net only for a member that carries a claim).
--
-- ── EXPLOIT SURFACE ──────────────────────────────────────────────────────────
-- No client verb is added; no client role reaches hunt_flame's writes or any new function. A forged claim can only name Remains its own
-- delta carries, inside its hero's hunted span, and it lands its units in the fire instead of the bag (the same units, never more); the
-- gross stays inside the kill bound or burns nothing. The fire's height is the walk's (room, decay, worth, target: the catalogue twins);
-- the luck a hunt rolls at is frozen by the server at its start and never read from the edge. What the walk cannot re-prove is the
-- instant of a drop inside its span (it moves which minute a unit decays from, never how many units or their worth): the same trust the
-- dice rest on. ON THE PRE-EA SECURITY LIST (13-security-list.md S-29, N-5).
--
-- ── COST (100x: 2,000 accounts x 4 heroes x 10 h) ────────────────────────────
-- Dark: the read's one hr_flag_on (the instance's `flame`), one hr_flag_on at each hunt session's insert, the trigger one fewer flag read
--   a member a window (the fire left it): a party of four settles 3 statements fewer a window, a solo hero the same. No row is written.
-- Lit: a hunt_flame row a hunt session (~60 B), one company_flame update and one hunt_flame update an account a window, and the walk's
--   twin calls (a decay a drop, a burn a drop); no ledger row (the burn rides the member's own hunt row's meta). ~2,000 x 2 sessions a day
--   = 4,000 rows a day, ~0.25 MB; hunt_flame rows are a hunt's, kept as long as the session row.
--
-- EDGE: hr-accrue (hunt-settle.js flameDropsOf / the member `flame` claim; src/core/hunt-rewards.js giveDrop notes a Remains drop of the
--   read's fuel list). An
--   older edge sends no claim: the fire does not burn down until it deploys (the switch stays off until both land). An older database
--   hands no `flame`: the new edge sends nothing. Either order is safe.
-- REVERSIBLE: re-run 1063's trigger function and section (its §3, §4 text), 1071's hr_trait_drops_of, and re-apply 1071's two restated
--   bodies; drop the trigger hr_flame_session_freeze, the five functions and hunt_flame.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.company_flame') is null or to_regclass('public.hr_flame_rules') is null or to_regclass('public.hr_flame_fuel') is null
     or to_regprocedure('public.hr_flame_decay(bigint,bigint,bigint,bigint)') is null
     or to_regprocedure('public.hr_flame_burn_units(bigint,integer,bigint,integer,integer)') is null
     or to_regprocedure('public.hr_flame_luck_pm(bigint)') is null or to_regprocedure('public.hr_flame_level_of(bigint)') is null
     or to_regprocedure('public.hr_flame_room_mpts(integer)') is null or to_regprocedure('public.hr_flame_temper_settle()') is null
     or to_regprocedure('public.hr_flame_walk(bigint,bigint,bigint,jsonb,jsonb,integer,jsonb)') is null then
    raise exception 'PRECONDITION: 1063-flame-temper.sql and its catalogue first (company_flame, the flame twins)'; end if;
  if to_regprocedure('public.hr_trait_drops_of(uuid,integer)') is null or to_regclass('public.trait_pieces') is null
     or position('TRAIT-PIECES (1071-trait-pieces.sql)' in (select prosrc from pg_proc where oid = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure)) = 0
     or position('TRAIT-PIECES (1071-trait-pieces.sql)' in (select prosrc from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure)) = 0 then
    raise exception 'PRECONDITION: 1071-trait-pieces.sql first (its restated read and commit, hr_trait_drops_of)'; end if;
  if to_regprocedure('public.hr_flag_on(text)') is null or to_regprocedure('public.hr_reject(text,jsonb)') is null
     or to_regprocedure('public.hr_jsonb_add(jsonb,jsonb)') is null or to_regprocedure('public.hr_level_of(uuid,integer)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regclass('public.hunt_sessions') is null
     or to_regclass('public.hr_hunt_kill_bounds') is null or to_regclass('public.hr_hunt_ground_spawns') is null
     or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: a helper or table this file reads is missing'; end if;
end $mig$;

-- ── §1 THE TABLE ─────────────────────────────────────────────────────────────
create table if not exists public.hunt_flame (
  session_id uuid primary key references public.hunt_sessions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  slot       int  not null check (slot >= 0),
  luck_pm    int  not null default 0 check (luck_pm >= 0),
  top        int  not null default 1 check (top >= 1),
  units      bigint not null default 0 check (units >= 0),
  burned     jsonb not null default '{}'::jsonb check (jsonb_typeof(burned) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists hunt_flame_by_account on public.hunt_flame (user_id, created_at desc);
comment on table public.hunt_flame is '1074-inner-flame-luck.sql: one hunt session''s Inner Flame: the luck it rolls at and the top Level its fuel reads, frozen when it began, and the Remains its window walks burned. Written by hr_flame_session_freeze and hr_flame_settle only; no client write.';
alter table public.hunt_flame enable row level security;
revoke all on public.hunt_flame from public, anon, authenticated, service_role;
grant select on public.hunt_flame to authenticated;
drop policy if exists hunt_flame_own on public.hunt_flame;
create policy hunt_flame_own on public.hunt_flame for select to authenticated using (user_id = auth.uid());

-- ── §2 THE FREEZE: a hunt session's luck and top, when it begins ─────────────
create or replace function public.hr_flame_top_of(p_user uuid)
returns int language sql stable security definer set search_path = public, pg_catalog as $fn$
  -- INNER-FLAME (1074-inner-flame-luck.sql): the company's highest hero Level (21 section 1.2 `top`: a far company gets little from low bones)
  select greatest(1, coalesce(max(public.hr_level_of(ps.user_id, ps.slot)), 1)) from public.player_state ps where ps.user_id = p_user
$fn$;

create or replace function public.hr_flame_session_freeze()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  -- INNER-FLAME (1074-inner-flame-luck.sql): a hunt session rolls its Rares at the luck of its company's fire as it began, and its fuel
  -- reads the company's top Level as it began. Dark: nothing is frozen and the hunt rolls at no luck.
  if not public.hr_flag_on('inner_flame') then return null; end if;
  insert into public.hunt_flame (session_id, user_id, slot, luck_pm, top)
    values (new.id, new.user_id, new.slot,
            public.hr_flame_luck_pm(coalesce((select f.height_mpts from public.company_flame f where f.user_id = new.user_id), 0)),
            public.hr_flame_top_of(new.user_id))
    on conflict (session_id) do nothing;
  return null;
end $fn$;
drop trigger if exists hr_flame_session_freeze on public.hunt_sessions;
create trigger hr_flame_session_freeze after insert on public.hunt_sessions
  for each row execute function public.hr_flame_session_freeze();

-- ── §3 WHAT THE ROLLER READS (hr_trait_drops_of, RESTATED WHOLE: 1071's body with the luck frozen per hunt) ──
create or replace function public.hr_trait_drops_of(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_l int;
begin
  -- TRAIT-PIECES (1071-trait-pieces.sql): what the roller reads for this hero at the window's start: its pity by rarity (hero_pity, 0 for
  -- none) and its company's flame luck (21 section 1.2: after depth, before pity). null while trait_drops is off.
  -- INNER-FLAME (1074-inner-flame-luck.sql): the luck is the one its open hunt session froze when it began (hunt_flame), so every window
  -- of one hunt rolls at the same luck however the settles cut it; 0 while inner_flame is off or the hunt began dark.
  if not public.hr_flag_on('trait_drops') then return null; end if;
  if public.hr_flag_on('inner_flame') then
    select f.luck_pm into v_l from public.hunt_sessions s join public.hunt_flame f on f.session_id = s.id
     where s.user_id = p_user and s.slot = p_slot and s.ended_at is null order by s.hunt_from desc limit 1;
  end if;
  return jsonb_build_object(
    'pity', jsonb_build_object(
      'rare', coalesce((select misses from public.hero_pity where user_id = p_user and slot = p_slot and rarity = 'rare'), 0),
      'very_rare', coalesce((select misses from public.hero_pity where user_id = p_user and slot = p_slot and rarity = 'very_rare'), 0)),
    'luck_pm', coalesce(v_l, 0));
end $fn$;

-- ── §4 THE WALK: hr_flame_walk is the generated twin of src/core/inner-flame.js walk (1069-gear-phase-b-flame-temper-catalogue.generated.sql,
--   tools/gen-flame-temper.mjs, pinned there as VERIFY(t)); this file adds the fuel bound it reads beside it ──

-- The most of `p_item` one kill on `p_hunt` drops, times the member's journalled kills: hr_hunt_apply_member's own item bound, for fuel.
create or replace function public.hr_flame_fuel_cap(p_hunt text, p_item text, p_kills bigint)
returns numeric language sql stable security definer set search_path = public, pg_catalog as $fn$
  select greatest(0, coalesce(p_kills, 0)) * coalesce((select max(coalesce((b.drops->>p_item)::numeric, 0)) from public.hr_hunt_kill_bounds b
                                                        where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = p_hunt)), 0)
$fn$;

-- ── §5 THE SETTLE'S STEP: every claim re-proved, each company's fire walked once, before any member lands ──
create or replace function public.hr_flame_settle(p_instance uuid, p_hunt text, p_members jsonb)
returns void language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_claims_max constant int := 4000;   -- a fuse on a window's claim list, not a balance figure (a 10-minute window of a four drops ~80)
  v_m jsonb; v_x jsonb; v_u uuid; v_seq bigint := -1; v_from bigint; v_to bigint;
  v_items jsonb; v_kills bigint; v_sum jsonb; v_ok boolean; v_k text; v_v numeric;
  v_spans jsonb; v_drops jsonb; v_tops jsonb; f public.company_flame%rowtype; v_keep int; v_w jsonb; v_sid text; v_b jsonb;
  v_out jsonb := '{}'::jsonb; v_burnable jsonb := '{}'::jsonb; v_claims jsonb := '[]'::jsonb;
begin
  -- INNER-FLAME (1074-inner-flame-luck.sql): called by hr_hunt_apply_instance under its locks, only when a member carries `flame`.
  perform set_config('hr.flame_burned', '', true);
  if not public.hr_flag_on('inner_flame') then perform public.hr_reject('flame_dark'); end if;
  -- (1) every claim's shape, order and span; each member's claim is a subset of its own delta's loot
  for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
    continue when not (v_m ? 'flame');
    if jsonb_typeof(v_m->'flame') <> 'array' or jsonb_array_length(v_m->'flame') > c_claims_max then
      perform public.hr_reject('bad_flame', jsonb_build_object('session', v_m->'session')); end if;
    select floor(extract(epoch from h.settled_to) * 1000)::bigint into v_from from public.hunt_sessions h where h.id = (v_m->>'session')::uuid;
    begin v_to := floor(extract(epoch from (v_m->'hunt'->>'to')::timestamptz) * 1000)::bigint;
    exception when others then v_to := null; end;
    if v_from is null or v_to is null then perform public.hr_reject('bad_flame', jsonb_build_object('session', v_m->'session', 'why', 'span')); end if;
    v_sum := '{}'::jsonb;
    for v_x in select e.value from jsonb_array_elements(v_m->'flame') e loop
      if jsonb_typeof(v_x) <> 'array' or jsonb_array_length(v_x) <> 4
         or jsonb_typeof(v_x->0) <> 'number' or (v_x->>0) !~ '^[0-9]{1,15}$'
         or jsonb_typeof(v_x->1) <> 'number' or (v_x->>1) !~ '^[0-9]{1,9}$'
         or jsonb_typeof(v_x->2) <> 'string' or (v_x->>2) !~ '^[a-z0-9_]{1,64}$'
         or jsonb_typeof(v_x->3) <> 'number' or (v_x->>3) !~ '^[1-9][0-9]{0,8}$' then
        perform public.hr_reject('bad_flame', jsonb_build_object('session', v_m->'session', 'entry', v_x)); end if;
      if (v_x->>0)::bigint < v_from or (v_x->>0)::bigint > v_to then
        perform public.hr_reject('flame_when', jsonb_build_object('session', v_m->'session', 'at_ms', v_x->0, 'from', v_from, 'to', v_to)); end if;
      v_sum := v_sum || jsonb_build_object(v_x->>2, coalesce((v_sum->>(v_x->>2))::bigint, 0) + (v_x->>3)::bigint);
      v_claims := v_claims || jsonb_build_array(jsonb_build_array((v_x->>1)::bigint, (v_x->>0)::bigint, v_m->>'session', v_x->>2, (v_x->>3)::bigint, v_m->>'user'));
    end loop;
    v_items := case when jsonb_typeof(v_m->'delta'->'items') = 'object' then v_m->'delta'->'items' else '{}'::jsonb end;
    select e.key into v_k from jsonb_each(v_sum) e
     where e.value::numeric > coalesce(case when jsonb_typeof(v_items->e.key) = 'number' then (v_items->>e.key)::numeric end, 0) limit 1;
    if v_k is not null then
      perform public.hr_reject('flame_over', jsonb_build_object('session', v_m->'session', 'item', v_k, 'claimed', v_sum->v_k, 'delta', v_items->v_k)); end if;
    -- burnable: the member's gross of every claimed item inside the kill bound (else nothing of it burns; hr_hunt_apply_member judges it)
    v_kills := case when jsonb_typeof(v_m->'delta'->'journal'->'meta'->'kills') = 'number' then greatest(0, (v_m->'delta'->'journal'->'meta'->>'kills')::numeric::bigint) else 0 end;
    v_ok := not exists (select 1 from jsonb_each(v_sum) e
                         where coalesce((v_items->>e.key)::numeric, 0) > public.hr_flame_fuel_cap(p_hunt, e.key, v_kills));
    v_burnable := v_burnable || jsonb_build_object(v_m->>'session', v_ok);
  end loop;
  -- the seqs are one order across the whole settle, each used once (the engine's: hr_flame_walk walks them in it, and a drop whose instant
  -- stands before the walk's clock goes on at the clock, so the order alone decides; every instant is already inside its hero's span)
  for v_x in select e.value from jsonb_array_elements(v_claims) e order by (e.value->>0)::bigint loop
    if (v_x->>0)::bigint <= v_seq then
      perform public.hr_reject('flame_order', jsonb_build_object('seq', v_x->0, 'at_ms', v_x->1)); end if;
    v_seq := (v_x->>0)::bigint;
  end loop;
  -- (2) each company's fire, walked once over its heroes' spans and drops
  for v_u in select distinct (e.value->>'user')::uuid from jsonb_array_elements(p_members) e where e.value ? 'flame' order by 1 loop
    insert into public.company_flame (user_id) values (v_u) on conflict (user_id) do nothing;
    select * into f from public.company_flame where user_id = v_u for update;
    v_spans := '[]'::jsonb; v_tops := '{}'::jsonb;
    for v_m in select e.value from jsonb_array_elements(p_members) e
                where e.value ? 'flame' and (e.value->>'user')::uuid = v_u order by (e.value->>'slot')::int loop
      v_sid := v_m->>'session';
      select floor(extract(epoch from h.settled_to) * 1000)::bigint into v_from from public.hunt_sessions h where h.id = v_sid::uuid;
      v_to := floor(extract(epoch from (v_m->'hunt'->>'to')::timestamptz) * 1000)::bigint;
      v_spans := v_spans || jsonb_build_array(jsonb_build_array(v_sid, v_from, v_to));
      -- a hunt that began while the fire was dark freezes here (no luck: it rolled at none; the top as of now)
      insert into public.hunt_flame (session_id, user_id, slot, luck_pm, top)
        values (v_sid::uuid, v_u, (v_m->>'slot')::int, 0, public.hr_flame_top_of(v_u)) on conflict (session_id) do nothing;
      v_tops := v_tops || jsonb_build_object(v_sid, (select hf.top from public.hunt_flame hf where hf.session_id = v_sid::uuid));
    end loop;
    select coalesce(jsonb_agg(jsonb_build_array(e.value->1, e.value->2, e.value->3, e.value->4) order by (e.value->>0)::bigint), '[]'::jsonb) into v_drops
      from jsonb_array_elements(v_claims) e
     where (e.value->>5)::uuid = v_u and coalesce((v_burnable->>(e.value->>2))::boolean, false);
    select coalesce((r.keeps->>(f.stoke->>'keep'))::int, 0) into v_keep from public.hr_flame_rules r where r.id = 1;
    v_w := public.hr_flame_walk(f.height_mpts, f.flame_points, f.carry_ms, v_spans, v_drops, v_keep, v_tops);
    update public.company_flame
       set height_mpts = (v_w->>'height')::bigint, flame_points = (v_w->>'points')::bigint, carry_ms = (v_w->>'carry_ms')::bigint,
           flame_level = (v_w->>'level')::int, updated_at = now()
     where user_id = v_u;
    if (v_w->>'units')::bigint > 0 then
      -- each hunt of this company that burned, by its own session and account (tests/selfcheck-no-global-dml.mjs: declared names)
      for v_sid, v_b in select b.key, b.value from jsonb_each(v_w->'burned') b order by b.key loop
        update public.hunt_flame hf
           set burned = public.hr_jsonb_add(hf.burned, v_b),
               units = hf.units + (select coalesce(sum((x.value #>> '{}')::bigint), 0) from jsonb_each(v_b) x)
         where hf.session_id = v_sid::uuid and hf.user_id = v_u;
      end loop;
      v_out := v_out || (v_w->'burned');
    end if;
  end loop;
  perform set_config('hr.flame_burned', v_out::text, true);
end $fn$;

-- A member's delta, NET of the Remains the walk burned for it (the bag never sees them), its journal's meta naming them.
create or replace function public.hr_flame_net(p_m jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_b jsonb; v_items jsonb; v_k text; v_n bigint; v_d jsonb;
begin
  -- INNER-FLAME (1074-inner-flame-luck.sql): a member with no `flame` claim lands its delta as the edge proposed it.
  if p_m is null or not (p_m ? 'flame') then return p_m->'delta'; end if;
  v_b := nullif(current_setting('hr.flame_burned', true), '')::jsonb -> (p_m->>'session');
  if v_b is null or v_b = '{}'::jsonb then return p_m->'delta'; end if;
  v_d := p_m->'delta';
  v_items := v_d->'items';
  for v_k, v_n in select e.key, (e.value #>> '{}')::bigint from jsonb_each(v_b) e loop
    if (v_items->>v_k)::numeric - v_n > 0 then v_items := v_items || jsonb_build_object(v_k, (v_items->>v_k)::numeric - v_n);
    else v_items := v_items - v_k; end if;
  end loop;
  v_d := jsonb_set(v_d, '{items}', v_items);
  if jsonb_typeof(v_d->'journal') = 'object' then
    v_d := jsonb_set(v_d, '{journal,meta}', coalesce(case when jsonb_typeof(v_d->'journal'->'meta') = 'object' then v_d->'journal'->'meta' end, '{}'::jsonb)
                                           || jsonb_build_object('flame', jsonb_build_object('burned', v_b)));
  end if;
  return v_d;
end $fn$;

-- ── §6 THE SPLICES: the read hands `flame`; the commit walks the fire and lands each member net ──
do $mig$
declare
  v_def text; v_n int; v_a text;
  c_read constant text := 'public.hr_hunt_instance_read(uuid,integer)';
  c_apply constant text := 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)';
  ra constant text[] := array[
$a$      'trait_drops', public.hr_flag_on('trait_drops'),
$a$];
  rr constant text[] := array[
$a$      'trait_drops', public.hr_flag_on('trait_drops'),
      -- INNER-FLAME (1074-inner-flame-luck.sql): the Remains items the company fires burn (hr_flame_fuel), null while the switch inner_flame
      -- is off (hunt-settle.js flameDropsOf): the edge names each one a hero picks up only then, and only these.
      'flame', case when public.hr_flag_on('inner_flame') then (select coalesce(jsonb_agg(f.item_id order by f.item_id), '[]'::jsonb) from public.hr_flame_fuel f) end,
$a$];
  aa constant text[] := array[
$a$'analyzer', 'traits'))) then$a$,
$a$    perform set_config('hr.boss_plan', coalesce(public.hr_boss_call_plan(p_instance, p_members, v_to)::text, ''), true);
$a$,
$a$(v_m->>'intent')::uuid, v_m->'delta', v_m->'hunt', v_m->'analyzer');$a$];
  ar constant text[] := array[
$a$'analyzer', 'traits', 'flame'))) then$a$,
$a$    perform set_config('hr.boss_plan', coalesce(public.hr_boss_call_plan(p_instance, p_members, v_to)::text, ''), true);
    -- INNER-FLAME (1074-inner-flame-luck.sql): THE COMPANY FIRES, walked once before any member lands (hr_flame_settle: every claim
    --   re-proved, each account's fire FOR UPDATE after the purses above); each member then lands NET of what it burned (hr_flame_net).
    --   Only when a member carries `flame` (the edge sends it only when the read says inner_flame is on); a jsonpath test, no statement.
    if p_members @? '$[*].flame' then perform public.hr_flame_settle(p_instance, v_i.hunt_id, p_members); end if;
$a$,
$a$(v_m->>'intent')::uuid, public.hr_flame_net(v_m), v_m->'hunt', v_m->'analyzer');$a$];
begin
  v_def := replace(pg_get_functiondef(c_read::regprocedure), chr(13), '');
  if position('INNER-FLAME (1074-inner-flame-luck.sql)' in v_def) = 0 then
    for i in 1 .. array_length(ra, 1) loop
      v_a := replace(ra[i], chr(13), '');
      v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
      if v_n <> 1 then raise exception 'inner-flame §6: hr_hunt_instance_read anchor % matched % times (need 1): the body moved; re-derive', i, v_n; end if;
      v_def := replace(v_def, v_a, replace(rr[i], chr(13), ''));
    end loop;
    execute v_def;
  end if;
  v_def := replace(pg_get_functiondef(c_apply::regprocedure), chr(13), '');
  if position('INNER-FLAME (1074-inner-flame-luck.sql)' in v_def) = 0 then
    for i in 1 .. array_length(aa, 1) loop
      v_a := replace(aa[i], chr(13), '');
      v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
      if v_n <> 1 then raise exception 'inner-flame §6: hr_hunt_apply_instance anchor % matched % times (need 1): the body moved; re-derive', i, v_n; end if;
      v_def := replace(v_def, v_a, replace(ar[i], chr(13), ''));
    end loop;
    execute v_def;
  end if;
end $mig$;
revoke all on function public.hr_hunt_instance_read(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.hr_hunt_instance_read(uuid, integer) to hr_engine;
revoke all on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, integer) to hr_engine;

-- ── §7 THE TRIGGER, RESTATED WHOLE (1063's §3 less the fire: the imbuement timers only) ──
create or replace function public.hr_flame_temper_settle()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_ms bigint;
begin
  -- 1063-flame-temper.sql: a hero's settled window moved forward by v_ms hunted milliseconds. Only hunted time moves an imbuement's clock.
  -- INNER-FLAME (1074-inner-flame-luck.sql): the fire left this trigger for the settle's walk (hr_flame_settle), on the window's own clock.
  v_ms := floor(extract(epoch from (new.settled_to - old.settled_to)) * 1000)::bigint;
  if v_ms <= 0 then return null; end if;
  if public.hr_flag_on('imbuements') then
    -- spent first (its last hunted ms ran out in this window), then the rest count down: never a row counted twice
    delete from public.hero_worn_imbue where user_id = new.user_id and slot = new.slot and ms_left <= v_ms;
    update public.hero_worn_imbue set ms_left = ms_left - v_ms, updated_at = now() where user_id = new.user_id and slot = new.slot;
  end if;
  return null;
end $fn$;

-- ── §8 THE SECTION `flame`, RESTATED WHOLE (1063's, plus the account's hunts: the return card's line) ──
create or replace function public.hr_flame_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare f public.company_flame%rowtype; v_l int; v_h bigint;
begin
  -- THE SECTION `flame` (1063-flame-temper.sql; 21 section 1.5): the account's flame as the server holds it. null while dark.
  -- INNER-FLAME (1074-inner-flame-luck.sql): `hunts`, the account's eight newest hunt sessions with the luck each rolls at and the Remains
  -- its walk burned (src/session/flame-sections.js, the return card's "Flame: burned 41 Remains · Rare chance +26%").
  if not public.hr_flag_on('inner_flame') then return null; end if;
  select * into f from public.company_flame where user_id = p_user;
  v_l := coalesce(f.flame_level, 1); v_h := coalesce(f.height_mpts, 0);
  return jsonb_build_object('level', v_l, 'points', coalesce(f.flame_points, 0), 'height', v_h, 'room', public.hr_flame_room_mpts(v_l),
                            'luck_pm', public.hr_flame_luck_pm(v_h), 'burn_ppm', public.hr_flame_decay_ppm(v_l),
                            'stoke', coalesce(f.stoke, public.hr_flame_stoke_clamp('{"keep": "full"}'::jsonb)),
                            'fuel', (select jsonb_object_agg(item_id, band) from public.hr_flame_fuel),
                            'hunts', coalesce((select jsonb_agg(jsonb_build_object('session', x.session_id, 'slot', x.slot, 'luck_pm', x.luck_pm, 'units', x.units)
                                                                order by x.created_at desc, x.session_id)
                                                 from (select * from public.hunt_flame h where h.user_id = p_user order by h.created_at desc, h.session_id limit 8) x), '[]'::jsonb));
end $fn$;

-- ── GRANTS: every function here is the server's own ──
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_flame_top_of(uuid)', 'public.hr_flame_session_freeze()', 'public.hr_trait_drops_of(uuid,integer)',
      'public.hr_flame_fuel_cap(text,text,bigint)',
      'public.hr_flame_settle(uuid,text,jsonb)', 'public.hr_flame_net(jsonb)', 'public.hr_flame_temper_settle()',
      'public.hr_flame_view(uuid,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $mig$;

-- ── §9 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) DARK: with the switches as applied (off), a hunt session's insert freezes nothing, the section is null, the roller reads no luck,
--     and a claim reaching the settle's step is refused flame_dark.
-- (b) THE WALK is the generated twin's (tools/gen-flame-temper.mjs VERIFY(t) pins it against src/core/inner-flame.js walk at four windows).
-- (c) LIT: an insert freezes the luck of the company's height and its top; the roller reads it while the fire moves; the section lists
--     the hunt; a dark-begun hunt reads no luck.
-- (d) THE NET DELTA: a member's burned Remains leave its items (a whole stack leaves the key) and name themselves in its journal's meta;
--     a member with no claim lands as proposed.
-- (e) THE SPLICES are in place, and the grants: no client reaches a new function or hunt_flame's writes; grant hygiene is quiet.
do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-000000f1a074';
  v jsonb; v_s uuid; v_w jsonb; v_r record; v_luck int;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'inner-flame §9 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    -- (a) dark
    update public.hr_flags set enabled = false where key in ('inner_flame', 'trait_drops');
    insert into public.hunt_sessions (user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at)
      values (v_u, 0, (select hunt_id from public.hr_hunts order by hunt_id limit 1), now() - interval '1 hour', now() - interval '1 hour',
              now() - interval '1 hour', now()) returning id into v_s;
    if exists (select 1 from public.hunt_flame where session_id = v_s) or public.hr_flame_view(v_u, 0) is not null then
      raise exception 'VERIFY(a): a dark hunt froze a flame or the section shows one'; end if;
    begin
      perform public.hr_flame_settle(gen_random_uuid(), 'x', jsonb_build_array(jsonb_build_object('user', v_u, 'slot', 0, 'session', v_s, 'flame', '[]'::jsonb)));
      raise exception 'VERIFY(a): a claim while dark was not refused';
    exception when sqlstate 'HR000' then
      if sqlerrm <> 'flame_dark' then raise exception 'VERIFY(a): a dark claim answered %', sqlerrm; end if;
    end;
    delete from public.hunt_sessions where id = v_s;

    -- (c) lit: the freeze, the roller's read, the section
    update public.hr_flags set enabled = true where key in ('inner_flame', 'trait_drops');
    insert into public.company_flame (user_id, height_mpts) values (v_u, 15000)
      on conflict (user_id) do update set height_mpts = excluded.height_mpts;
    insert into public.hunt_sessions (user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at)
      values (v_u, 0, (select hunt_id from public.hr_hunts order by hunt_id limit 1), now() - interval '1 hour', now() - interval '1 hour',
              now() - interval '1 hour', now()) returning id into v_s;
    v_luck := public.hr_flame_luck_pm(15000);
    if (select luck_pm from public.hunt_flame where session_id = v_s) is distinct from v_luck or v_luck <= 0
       or (select top from public.hunt_flame where session_id = v_s) is distinct from public.hr_flame_top_of(v_u) then
      raise exception 'VERIFY(c): the hunt froze % (want luck % top %)', (select row(luck_pm, top) from public.hunt_flame where session_id = v_s), v_luck, public.hr_flame_top_of(v_u); end if;
    update public.company_flame set height_mpts = 0 where user_id = v_u;
    if (public.hr_trait_drops_of(v_u, 0)->>'luck_pm')::int is distinct from v_luck then
      raise exception 'VERIFY(c): the roller reads % while the hunt froze % (the fire moved under it)', public.hr_trait_drops_of(v_u, 0), v_luck; end if;
    if (public.hr_flame_view(v_u, 0)->'hunts'->0->>'session')::uuid is distinct from v_s or (public.hr_flame_view(v_u, 0)->'hunts'->0->>'luck_pm')::int <> v_luck then
      raise exception 'VERIFY(c): the section lists %', public.hr_flame_view(v_u, 0)->'hunts'; end if;
    delete from public.hunt_flame where session_id = v_s;
    if (public.hr_trait_drops_of(v_u, 0)->>'luck_pm')::int is distinct from 0 then
      raise exception 'VERIFY(c): a hunt with no frozen flame reads luck %', public.hr_trait_drops_of(v_u, 0); end if;

    -- (d) the net delta
    perform set_config('hr.flame_burned', jsonb_build_object(v_s::text, jsonb_build_object('bones', 3, 'grave_dust', 2))::text, true);
    v := public.hr_flame_net(jsonb_build_object('session', v_s, 'flame', '[]'::jsonb,
           'delta', jsonb_build_object('items', jsonb_build_object('bones', 5, 'grave_dust', 2, 'coin_pouch', 1), 'journal', jsonb_build_object('meta', jsonb_build_object('kills', 9)))));
    if v->'items' is distinct from '{"bones": 2, "coin_pouch": 1}'::jsonb or v->'journal'->'meta' is distinct from '{"kills": 9, "flame": {"burned": {"bones": 3, "grave_dust": 2}}}'::jsonb then
      raise exception 'VERIFY(d): the net delta is %', v; end if;
    v := public.hr_flame_net(jsonb_build_object('session', v_s, 'delta', jsonb_build_object('items', jsonb_build_object('bones', 5))));
    if v is distinct from '{"items": {"bones": 5}}'::jsonb then raise exception 'VERIFY(d): a member with no claim landed %', v; end if;

    raise exception using errcode = 'HRF74', message = 'inner-flame §9 complete - rolling back';
  exception when sqlstate 'HRF74' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('hr.flame_burned', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.hunt_flame where user_id = v_u)
     or exists (select 1 from public.company_flame where user_id = v_u) then
    raise exception 'VERIFY(e): §9 LEAKED a probe row'; end if;
  if exists (select 1 from public.hr_flags where key = 'inner_flame' and enabled) then raise exception 'VERIFY(e): inner_flame is lit after the apply'; end if;
  -- (e) the splices
  if position('''flame'', case when public.hr_flag_on(''inner_flame'')' in (select prosrc from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure)) = 0
     or position('hr_flame_settle(p_instance, v_i.hunt_id, p_members)' in (select prosrc from pg_proc where oid = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure)) = 0
     or position('public.hr_flame_net(v_m)' in (select prosrc from pg_proc where oid = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure)) = 0
     or position('''traits'', ''flame''' in (select prosrc from pg_proc where oid = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure)) = 0
     or position('height_mpts' in (select prosrc from pg_proc where oid = 'public.hr_flame_temper_settle()'::regprocedure)) > 0 then
    raise exception 'VERIFY(e): a splice is missing, or the trigger still burns the fire'; end if;
  -- (e) the grants
  if exists (select 1 from unnest(array['anon', 'authenticated']) g(r), unnest(array['public.hr_flame_top_of(uuid)', 'public.hr_flame_session_freeze()',
                 'public.hr_flame_walk(bigint,bigint,bigint,jsonb,jsonb,integer,jsonb)', 'public.hr_flame_fuel_cap(text,text,bigint)',
                 'public.hr_flame_settle(uuid,text,jsonb)', 'public.hr_flame_net(jsonb)', 'public.hr_trait_drops_of(uuid,integer)']) s(sig)
              where has_function_privilege(g.r, s.sig, 'execute'))
     or has_table_privilege('authenticated', 'public.hunt_flame', 'insert') or has_table_privilege('authenticated', 'public.hunt_flame', 'update')
     or has_table_privilege('anon', 'public.hunt_flame', 'select') then
    raise exception 'VERIFY(e): a client role reaches a new function or writes hunt_flame'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'inner-flame: dark; luck frozen per hunt at its start; the walk equals the JS twin at four windows; a member lands net of its burned Remains; all green';
end $$;
