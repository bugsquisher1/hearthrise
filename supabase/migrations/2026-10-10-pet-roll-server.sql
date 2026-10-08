-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-10-pet-roll-server.sql — ROLLED PETS ARE ROLLED BY THE SERVER.
--                                  hr_companion_grant STOPS TAKING THE
--                                  CLIENT'S WORD FOR THEM.
--
-- RESTATEMENT-DEBT-ACK: adds 5 anchored patches to hr_apply (chain depth 9 -> 14 since the 2026-09-14 restatement). Kept anchored so the Security review of a money-surface change reads only the spliced text, not a 3,300-line body; every anchor is asserted EXACTLY ONCE and RAISES otherwise, and the self-check exercises each spliced arm. The hr_apply restatement (slice 7) is owed next and should land as its own reviewed file.
--
-- STAGED, NOT APPLIED - REVIEW ONLY. SECURITY GO REQUIRED BEFORE APPLY (lane C:
--   it patches hr_apply, the economy's single write path, and a client RPC).
--   The Coordinator applies it with
--   `node tools/apply-migration.mjs supabase/migrations/2026-10-10-pet-roll-server.sql`
--   (one file, never inside begin/commit, never 00:00-00:10 UTC).
--   EDGE REDEPLOY REQUIRED (src/core/pet-roll.js + accrual.js, envelope.js,
--   tick-contract.js, tick-party.js). SAFE IN EITHER ORDER: the engine proposes
--   `companion_finds` only when the envelope says `pet_roll_ready` (projected
--   by THIS file), so an edge deployed first is inert; a database migrated
--   first simply receives no claims until the edge ships.
--   CLIENT HALF (pets.js deleted, companions.js drop roll deleted, ownership
--   arrives through the envelope) rides the next cut AFTER this applies —
--   after the apply an old client's rolled-pet claim is refused
--   `rolled_server_side` and grants nothing, which is the point.
--
-- ── THE DEFECT (whole-game review, 2026-10-08) ──────────────────────────────
-- Fifteen companions are ROLLED: eight `skill:<skill>:<N>` pets (1-in-1,200 to
-- 1-in-2,500 per skill action), two `boss:<monster>:<N>` pets (1-in-200 per
-- boss kill) and five `drop:<monster>` pets (0.5-1% per kill). The roll ran in
-- the BROWSER (src/features/pets.js, src/features/companions.js) and a hit was
-- CLAIMED through hr_companion_grant(slot, companion, source), which checked
-- only that the id was a rollable pet. So any of the fifteen — permanent perk
-- bonuses on the gather/artisan/combat rate keys — was one RPC away, and
-- whether the roll ever happened was the client's word. CLAUDE.md §1.
--
-- ── THE RULING (Game Designer, final) ───────────────────────────────────────
-- "The 1-in-N roll moves server-side, into the accrual/activity settle for skill
--  pets and the boss kill settle for boss pets. hr_companion_grant stops
--  accepting a client claim for rolled pets."
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   §1 hr_companion_grants.source_id — the source's id (`woodcutting`, `lich`,
--      `small_wolf`, `harvest100`), ⟦DERIVED⟧ from src/data/companions.js and
--      bound both ways by tests/pet-roll.mjs. hr_apply re-derives every claim's
--      PAIR from this row, so a claim for the wrong source is refused.
--   §2 hr_state_of projects `pet_roll_ready: true` — the engine's switch (the
--      hearthfind_ready idiom; anchored, exactly once).
--   §3 hr_apply allowlists `companion_finds` — an ARRAY of ≤16
--      {companion, source_kind, source_id} claims (programmatic, anchored,
--      exactly-once, the 2026-09-08-hearthfind.sql idiom):
--        (a) SHAPE + PAIR, refused `bad_companion_find` (the whole apply rolls
--            back — states an honest engine cannot produce);
--        (b) per claim, under the character lock: an OWNED pet is skipped (a
--            pet is binary); a missing hr_unlocks storage row is skipped with a
--            rejection row (never a 500 that costs the night); over the day's
--            ceiling (4 rolled pets per character per UTC day, counted from the
--            ledger) the claim is DROPPED with a rejection row and the rest of
--            the apply proceeds — the hearthfind rule, for the same reason;
--        (c) the ownership row (player_progress unlock 'companion:<id>' = 1,
--            through the existing storage guard) and ONE ledger row per granted
--            pet (kind 'admin', intent 'companion_roll', meta.via 'server_roll');
--        (d) the receipt `companion_finds` on the apply's return, so an away
--            find is revealed on the settle response.
--   §4 hr_companion_grant: a `skill` / `boss` / `drop` companion is REFUSED
--      `rolled_server_side` (journalled, nothing written); the one `quest`
--      companion (bunny, `quest:harvest100`) is granted only when the server's
--      own lifetime ev:harvest >= 100 (`quest_incomplete` otherwise). `hatch`
--      (whelp + dragon_egg) is unchanged. So the client claim path keeps only
--      what the server can verify.
--   §5 self-check — executed, net-zero.
--
-- ── HOW THE ENGINE ROLLS (src/core/pet-roll.js) ─────────────────────────────
-- One draw per eligible pet source per settle, against 1-(1-p)^n for the n
-- qualifying events the settle PAID (kills of the monster incl. the attended
-- top-up; gather/artisan actions of the skill — the companion-XP basis), on a
-- DEDICATED stream seeded `seed ^ PET_RNG_SALT`: no other roll moves, and the
-- verdict replays from (seed, counts). Distributionally identical to n client
-- rolls, because a pet is binary.
--
-- ── KNOWN LIMITATIONS, NAMED ────────────────────────────────────────────────
--   · SQUIRREL (skill:farming): the farm harvest is settled by hr_farm_harvest,
--     a SQL RPC with no engine roll site (the hearthfind 'crop' limitation, same
--     reason: AWAY-12 forbids a second engine). The client roll is gone and the
--     claim is refused, so the Squirrel is unobtainable until a farming roll
--     site exists. Flagged for the Designer.
--   · PARTY combat settles roll no pet: hr_party_tick_settle's delta vocabulary
--     (c_delta_ok) predates the key, so tick-party.js strips it rather than
--     have four players' window refused. A follow-up widens that vocabulary.
--   · The probability itself cannot be re-verified by Postgres (it would need
--     the seed and the simulation) — the same boundary as the hearthfind. The
--     server-side bounds are the pair, owned-once and the daily ceiling, and
--     the engine is server code (hr_engine), never the browser.
--
-- ── COST AT 100x PLAYERS ────────────────────────────────────────────────────
-- One text column on a 17-row catalogue. hr_apply does nothing extra on the
-- ~100% of applies without the key (`p_delta ? 'companion_finds'`
-- short-circuits). A grant is ≤15 rows per character EVER (ownership + ledger).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Anchored inserts; revert = pg_get_functiondef minus the inserted blocks
-- (each is fenced by the marker '2026-10-10-pet-roll-server.sql'), or re-apply
-- 2026-09-06-companion-grant-hardening.sql for hr_companion_grant ⚠ which is
-- otherwise FORBIDDEN after this file: its §0 accepts this body as "already
-- hardened" and restates its own text, silently deleting §4. Pets already
-- granted are ordinary ownership rows and stay.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ───────────────────────────────────────────
do $$
declare v_def text; v_n int; a text;
begin
  if to_regclass('public.hr_companion_grants') is null or to_regclass('public.hr_unlocks') is null then
    raise exception 'PRECONDITION: hr_companion_grants / hr_unlocks are absent';
  end if;
  if (select count(*) from public.hr_companion_grants where source_kind in ('skill','boss','drop')) <> 15 then
    raise exception 'PRECONDITION: hr_companion_grants does not hold the 15 rolled companions this file was reviewed against';
  end if;
  v_def := pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure);
  foreach a in array array[
      $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',$anc$,
      $anc$  c_release_codes constant text[] := array[
$anc$,
      $anc$  v_fight jsonb;$anc$,
      $anc$    if p_delta ? 'workers' then$anc$,
      $anc$    if v_hf_out is not null then
      v_out := jsonb_set(v_out, '{hearthfind}', v_hf_out);
    end if;$anc$] loop
    v_n := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
    if v_n <> 1 and strpos(v_def, '2026-10-10-pet-roll-server.sql') = 0 then
      raise exception 'hr_apply: anchor % occurs % times, expected exactly 1', a, v_n;
    end if;
  end loop;
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if strpos(v_def, 'pet_roll_ready') = 0
     and (length(v_def) - length(replace(v_def, $anc$      'hearthfind_ready', true,$anc$, '')))
         <> length($anc$      'hearthfind_ready', true,$anc$) then
    raise exception 'hr_state_of: the hearthfind_ready anchor is not exactly once';
  end if;
end $$;

-- ── 1. THE SOURCE ID — ⟦DERIVED⟧ src/data/companions.js `source` ─────────────
alter table public.hr_companion_grants add column if not exists source_id text;
update public.hr_companion_grants g set source_id = v.sid
  from (values
    ('beaver', 'woodcutting'), ('rock_golem', 'mining'), ('heron', 'fishing'),
    ('squirrel', 'farming'), ('phoenix_chick', 'cooking'), ('forge_imp', 'smithing'),
    ('silkling', 'crafting'), ('grave_wisp', 'prayer'),
    ('lichling', 'lich'), ('dragonling', 'dragon'),
    ('wolf_pup', 'small_wolf'), ('badger', 'bear'), ('hawk', 'panther'),
    ('scorpion', 'shadow_creeper'), ('tortoise', 'ancient_bear'),
    ('bunny', 'harvest100'), ('whelp', 'dragon_egg')) v(cid, sid)
 where g.companion_id = v.cid and g.source_id is distinct from v.sid;

-- ── 2. hr_state_of — THE SWITCH (anchored, exactly once) ────────────────────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if strpos(v_def, 'pet_roll_ready') > 0 then
    raise notice 'hr_state_of already projects pet_roll_ready - skipping'; return;
  end if;
  execute replace(v_def, $anc$      'hearthfind_ready', true,$anc$,
    $anc$      'hearthfind_ready', true,
      -- THE PET ROLL's self-configuring switch (2026-10-10-pet-roll-server.sql):
      -- always true once that file has run; read by hr-accrue to decide whether
      -- to propose delta.companion_finds at all. Not a feature flag.
      'pet_roll_ready', true,$anc$);
end $mig$;

-- ── 3. hr_apply — companion_finds (programmatic, anchored, exactly once) ────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure);
  if strpos(v_def, '2026-10-10-pet-roll-server.sql') > 0 then
    raise notice 'hr_apply already handles companion_finds - skipping'; return;
  end if;

  v_def := replace(v_def,
    $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',$anc$,
    $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',
    -- THE PET ROLL (2026-10-10-pet-roll-server.sql): an ARRAY of claims
    -- {companion, source_kind, source_id}. Everything about a claim is
    -- re-derived from hr_companion_grants under the character lock.
    'companion_finds',$anc$);

  v_def := replace(v_def,
    $anc$  c_release_codes constant text[] := array[
$anc$,
    $anc$  c_release_codes constant text[] := array[
    'bad_companion_find',
$anc$);

  v_def := replace(v_def, $anc$  v_fight jsonb;$anc$,
    $anc$  -- THE PET ROLL (2026-10-10-pet-roll-server.sql). Every value below is
  -- server-derived; the delta supplies only lookup keys.
  v_cf        jsonb;
  v_cf_e      jsonb;
  v_cf_id     text;
  v_cf_kind   text;
  v_cf_src    text;
  v_cf_seen   text[] := '{}';
  v_cf_today  int;
  v_cf_out    jsonb := '[]'::jsonb;
  c_max_cf_per_apply constant int := 16;   -- > the 15 rollable pets: one array can name each once
  c_max_cf_per_day   constant int := 4;    -- anti-automation, not balance: 4 rolled pets in a UTC day is not playing
  v_fight jsonb;$anc$);

  v_def := replace(v_def, $anc$    if p_delta ? 'workers' then$anc$,
    $anc$    -- (4a-p) THE PET ROLL (2026-10-10-pet-roll-server.sql). Shape, then the PAIR.
    if p_delta ? 'companion_finds' then
      v_cf := p_delta->'companion_finds';
      if jsonb_typeof(v_cf) <> 'array' or jsonb_array_length(v_cf) < 1
         or jsonb_array_length(v_cf) > c_max_cf_per_apply then
        perform public.hr_reject('bad_companion_find',
          jsonb_build_object('why', 'not a 1..16 array', 'type', jsonb_typeof(v_cf)));
      end if;
      for v_cf_e in select e from jsonb_array_elements(v_cf) as t(e) loop
        if jsonb_typeof(v_cf_e) <> 'object'
           or exists (select 1 from jsonb_object_keys(v_cf_e) as cfk(cf_key)
                       where cfk.cf_key <> all (array['companion','source_kind','source_id'])) then
          perform public.hr_reject('bad_companion_find', jsonb_build_object('why', 'bad element'));
        end if;
        v_cf_id := v_cf_e->>'companion'; v_cf_kind := v_cf_e->>'source_kind'; v_cf_src := v_cf_e->>'source_id';
        if v_cf_id is null or v_cf_kind is null or v_cf_src is null
           or length(v_cf_id) > 64 or length(v_cf_kind) > 16 or length(v_cf_src) > 64 then
          perform public.hr_reject('bad_companion_find', jsonb_build_object('why', 'missing or oversized field'));
        end if;
        if not exists (select 1 from public.hr_companion_grants g
                        where g.companion_id = v_cf_id and g.source_kind = v_cf_kind
                          and g.source_id = v_cf_src and g.source_kind in ('skill','boss','drop')) then
          perform public.hr_reject('bad_companion_find',
            jsonb_build_object('why', 'no such rolled companion/source pair',
                               'companion', v_cf_id, 'source_kind', v_cf_kind, 'source_id', v_cf_src));
        end if;
      end loop;
    end if;

    if p_delta ? 'workers' then$anc$);

  v_def := replace(v_def,
    $anc$    if v_hf_out is not null then
      v_out := jsonb_set(v_out, '{hearthfind}', v_hf_out);
    end if;$anc$,
    $anc$    if v_hf_out is not null then
      v_out := jsonb_set(v_out, '{hearthfind}', v_hf_out);
    end if;
    -- (4z-p) THE PET ROLL GRANT (2026-10-10-pet-roll-server.sql), under the lock.
    if p_delta ? 'companion_finds' then
      for v_cf_e in select e from jsonb_array_elements(p_delta->'companion_finds') as t(e) loop
        v_cf_id := v_cf_e->>'companion';
        continue when v_cf_id = any (v_cf_seen);
        v_cf_seen := v_cf_seen || v_cf_id;
        -- OWNED: a pet is binary; a second find grants nothing.
        continue when exists (select 1 from public.player_progress
                               where user_id = v_uid and slot = v_slot and kind = 'unlock'
                                 and key = 'companion:' || v_cf_id and period_key = '' and value > 0);
        -- NO STORAGE ROW: skip and journal, never raise (a 500 would cost the night).
        if not exists (select 1 from public.hr_unlocks where unlock_id = 'companion:' || v_cf_id) then
          perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'companion_roll_unstorable',
            jsonb_build_object('companion', v_cf_id));
          continue;
        end if;
        select count(*) into v_cf_today from public.player_ledger
         where user_id = v_uid and slot = v_slot and kind = 'admin' and intent = 'companion_roll'
           and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
        if v_cf_today >= c_max_cf_per_day then
          perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'companion_roll_daily_cap',
            jsonb_build_object('companion', v_cf_id, 'today', v_cf_today, 'limit', c_max_cf_per_day));
          continue;
        end if;
        insert into public.player_progress (user_id, slot, kind, key, period_key, value)
          values (v_uid, v_slot, 'unlock', 'companion:' || v_cf_id, '', 1)
          on conflict (user_id, slot, kind, key, period_key) do nothing;
        insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)
          values (v_uid, v_slot, 'admin', 'companion_roll', 0, 0, 0, 0,
                  jsonb_build_object('companion', v_cf_id, 'source_kind', v_cf_e->>'source_kind',
                                     'source_id', v_cf_e->>'source_id', 'via', 'server_roll',
                                     'idem', p_intent_id));
        v_cf_out := v_cf_out || jsonb_build_object('companion', v_cf_id,
                      'source_kind', v_cf_e->>'source_kind', 'source_id', v_cf_e->>'source_id');
      end loop;
      if jsonb_array_length(v_cf_out) > 0 then
        -- Re-project so the envelope already shows the new owner, then re-attach
        -- the receipts this apply carries (the hearthfind's, then this one).
        v_out := public.hr_state_of(v_uid, v_slot);
        if v_hf_out is not null then
          v_out := jsonb_set(v_out, '{hearthfind}', v_hf_out);
        end if;
        v_out := jsonb_set(v_out, '{companion_finds}', v_cf_out);
      end if;
    end if;$anc$);

  execute v_def;
end $mig$;

-- ── 4. hr_companion_grant — no client claim for a ROLLED pet ────────────────
do $mig$
declare v_def text;
  c_anchor constant text := $anc$  -- ══ C2 — THE SERVER-VERIFIABLE PRECONDITION, ENFORCED ════════════════════$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_companion_grant(int,text,text,uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, '2026-10-10-pet-roll-server.sql') > 0 then
    raise notice 'hr_companion_grant already refuses rolled pets - skipping'; return;
  end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'hr_companion_grant: the C2 anchor is not exactly once - not the hardened body';
  end if;
  execute replace(v_def, c_anchor, $new$  -- 2026-10-10-pet-roll-server.sql: placed AFTER owned-once (an owner needs no
  -- write) and C1 Layer A (a missing catalogue row stays an INCIDENT, never a
  -- tidy refusal), BEFORE any spend. A ROLLED companion (skill / boss / drop) is
  -- granted ONLY by the server's own roll, inside the accrual settle (hr_apply
  -- `companion_finds`). A client saying "I rolled it" is refused and journalled.
  if v_cat.source_kind in ('skill', 'boss', 'drop') then
    perform public.hr_record_rejection(v_uid, coalesce(p_slot, 0), 'companion_grant', 'rolled_server_side',
      jsonb_build_object('companion', p_companion, 'claimed_source', p_source));
    return jsonb_build_object('ok', false, 'error', 'rolled_server_side', 'companion', p_companion);
  end if;
  -- The one QUEST companion is granted on the SERVER's counter, never the claim:
  -- source_id 'harvest<N>' = the lifetime stat ev:harvest >= N.
  if v_cat.source_kind = 'quest' then
    if v_cat.source_id !~ '^harvest[0-9]+$'
       or coalesce((select value from public.player_progress
                     where user_id = v_uid and slot = coalesce(p_slot, 0) and kind = 'stat'
                       and key = 'ev:harvest' and period_key = ''), 0)
          < substring(v_cat.source_id from '^harvest([0-9]+)$')::bigint then
      perform public.hr_record_rejection(v_uid, coalesce(p_slot, 0), 'companion_grant', 'quest_incomplete',
        jsonb_build_object('companion', p_companion, 'source_id', v_cat.source_id));
      return jsonb_build_object('ok', false, 'error', 'quest_incomplete', 'companion', p_companion);
    end if;
  end if;

$new$ || c_anchor);
end $mig$;
revoke execute on function public.hr_companion_grant(int, text, text, uuid) from public, anon, service_role;
grant  execute on function public.hr_companion_grant(int, text, text, uuid) to authenticated;

-- ── 5. SELF-CHECK — executed, net-zero (sentinel HR8A7) ─────────────────────
do $$
declare
  v       jsonb;
  v_uid   constant uuid := '000000c0-0000-0000-0000-00000000a107';
  v_n     int;
  v_hyg   jsonb;
begin
  -- (a) every rolled row has a source_id; no hand-typed pair is missing.
  select count(*) into v_n from public.hr_companion_grants
   where source_kind in ('skill','boss','drop','quest') and source_id is null;
  if v_n > 0 then raise exception 'VERIFY(a): % grantable row(s) have no source_id', v_n; end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version) values (v_uid, 0, 0, 0, 1);
    v := public.hr_state_of(v_uid, 0);
    if coalesce(v->'state'->>'pet_roll_ready', v->>'pet_roll_ready') is distinct from 'true' then
      raise exception 'VERIFY(b): hr_state_of does not project pet_roll_ready'; end if;

    -- (c) THE CLIENT CLAIM: a rolled pet is refused and nothing is written.
    v := public.hr_companion_grant(0, 'beaver', 'skill:woodcutting:2500', gen_random_uuid());
    if v->>'error' <> 'rolled_server_side' then raise exception 'VERIFY(c): a client beaver claim was not refused: %', v; end if;
    v := public.hr_companion_grant(0, 'lichling', 'boss:lich:200', gen_random_uuid());
    if v->>'error' <> 'rolled_server_side' then raise exception 'VERIFY(c): a client lichling claim was not refused: %', v; end if;
    v := public.hr_companion_grant(0, 'wolf_pup', 'drop:small_wolf', gen_random_uuid());
    if v->>'error' <> 'rolled_server_side' then raise exception 'VERIFY(c): a client wolf_pup claim was not refused: %', v; end if;
    -- the quest pet: refused below the server counter, granted at it.
    v := public.hr_companion_grant(0, 'bunny', 'quest:harvest100', gen_random_uuid());
    if v->>'error' <> 'quest_incomplete' then raise exception 'VERIFY(c): bunny granted with no harvests: %', v; end if;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, 0, 'stat', 'ev:harvest', 100, '', 'active');
    v := public.hr_companion_grant(0, 'bunny', 'quest:harvest100', gen_random_uuid());
    if coalesce(v->>'ok','') <> 'true' then raise exception 'VERIFY(c): bunny refused at 100 harvests: %', v; end if;
    if exists (select 1 from public.player_progress where user_id = v_uid and key in ('companion:beaver','companion:lichling','companion:wolf_pup')) then
      raise exception 'VERIFY(c): a refused client claim wrote an ownership row'; end if;

    -- (d) THE ENGINE CLAIM through hr_apply: granted once, journalled, receipted.
    v := public.hr_apply(v_uid, 0, (select version from public.player_state where user_id = v_uid and slot = 0),
                         gen_random_uuid(),
                         jsonb_build_object('companion_finds', jsonb_build_array(
                           jsonb_build_object('companion', 'lichling', 'source_kind', 'boss', 'source_id', 'lich'),
                           jsonb_build_object('companion', 'lichling', 'source_kind', 'boss', 'source_id', 'lich'))));
    if coalesce(v->>'ok','') <> 'true' then raise exception 'VERIFY(d): a valid engine claim was refused: %', v; end if;
    if jsonb_array_length(coalesce(v->'companion_finds', '[]'::jsonb)) <> 1 then
      raise exception 'VERIFY(d): the receipt does not carry exactly one find: %', v->'companion_finds'; end if;
    if not exists (select 1 from public.player_progress where user_id = v_uid and slot = 0
                    and kind = 'unlock' and key = 'companion:lichling' and value = 1) then
      raise exception 'VERIFY(d): no ownership row for the granted pet'; end if;
    select count(*) into v_n from public.player_ledger where user_id = v_uid and intent = 'companion_roll';
    if v_n <> 1 then raise exception 'VERIFY(d): % companion_roll journal rows, expected 1', v_n; end if;
    -- owned: a second find grants nothing and journals nothing.
    v := public.hr_apply(v_uid, 0, (select version from public.player_state where user_id = v_uid and slot = 0),
                         gen_random_uuid(),
                         jsonb_build_object('companion_finds', jsonb_build_array(
                           jsonb_build_object('companion', 'lichling', 'source_kind', 'boss', 'source_id', 'lich'))));
    if coalesce(v->>'ok','') <> 'true' or v ? 'companion_finds' then
      raise exception 'VERIFY(d): an owned pet was granted again: %', v; end if;

    -- (e) the WRONG PAIR, a shop pet and garbage are refused bad_companion_find.
    v := public.hr_apply(v_uid, 0, (select version from public.player_state where user_id = v_uid and slot = 0),
                         gen_random_uuid(),
                         jsonb_build_object('companion_finds', jsonb_build_array(
                           jsonb_build_object('companion', 'dragonling', 'source_kind', 'boss', 'source_id', 'goblin'))));
    if v->>'error' <> 'bad_companion_find' then raise exception 'VERIFY(e): a wrong pair was accepted: %', v; end if;
    v := public.hr_apply(v_uid, 0, (select version from public.player_state where user_id = v_uid and slot = 0),
                         gen_random_uuid(),
                         jsonb_build_object('companion_finds', jsonb_build_array(
                           jsonb_build_object('companion', 'raccoon', 'source_kind', 'skill', 'source_id', 'x'))));
    if v->>'error' <> 'bad_companion_find' then raise exception 'VERIFY(e): a shop pet was accepted: %', v; end if;
    v := public.hr_apply(v_uid, 0, (select version from public.player_state where user_id = v_uid and slot = 0),
                         gen_random_uuid(), jsonb_build_object('companion_finds', '"beaver"'::jsonb));
    if v->>'error' <> 'bad_companion_find' then raise exception 'VERIFY(e): a non-array was accepted: %', v; end if;

    -- (f) the daily ceiling drops (not refuses): after 4 grants today, a 5th is skipped.
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)
      select v_uid, 0, 'admin', 'companion_roll', 0, 0, 0, 0, '{}'::jsonb from generate_series(1, 3);
    v := public.hr_apply(v_uid, 0, (select version from public.player_state where user_id = v_uid and slot = 0),
                         gen_random_uuid(),
                         jsonb_build_object('companion_finds', jsonb_build_array(
                           jsonb_build_object('companion', 'beaver', 'source_kind', 'skill', 'source_id', 'woodcutting'))));
    if coalesce(v->>'ok','') <> 'true' or exists (select 1 from public.player_progress
         where user_id = v_uid and key = 'companion:beaver') then
      raise exception 'VERIFY(f): the daily ceiling did not drop the 5th find: %', v; end if;

    raise exception using errcode = 'HR8A7', message = 'pet-roll-server §5 complete - rolling back';
  exception when sqlstate 'HR8A7' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.hr_rejections where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY: §5 LEAKED a probe row';
  end if;
  v_hyg := public.hr_assert_grant_hygiene(false);
  if jsonb_array_length(coalesce(v_hyg->'unapproved_client_rpcs', '[]'::jsonb)) <> 0 then
    raise exception 'VERIFY: grant hygiene: %', v_hyg->'unapproved_client_rpcs';
  end if;
  raise notice 'pet-roll-server: rolled pets refused on the client path, bunny on the server counter, '
               'engine claims granted once/owned-skipped/wrong-pair refused/daily-capped, switch projected — all green';
end $$;
