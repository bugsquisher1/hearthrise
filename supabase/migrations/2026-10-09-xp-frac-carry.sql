-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-09-xp-frac-carry.sql — FRACTIONAL XP IS CARRIED, NOT FLOORED AWAY.
--
-- STATUS: STAGED, NOT APPLIED - REVIEW ONLY. Moves XP, a RANKED surface, so it
-- moves only on a Security GO and the Coordinator applies it (one file,
-- tools/apply-migration.mjs). APPLY ORDER: last in the chain, after
-- 2026-10-11-world-tick-ledger-fold.sql; it depends on none of the 2026-10-09..11
-- files and none of them restates hr_apply or hr_state_of (tests/schema-apply-order.json).
-- EITHER ORDER WITH THE EDGE IS SAFE: the engine proposes `xp_frac` only when
-- hr_state_of projects `frac` (envelope.js presence-of-key), which only this
-- file makes it do — so an edge deployed first proposes nothing new, and this
-- file applied first projects a key the old edge ignores.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────────
-- grantXp (src/core/progression.js) floored EVERY grant. Since b565 XP is paid
-- on damage DEALT, so an 8-HP kill pays ~10 XP per skill and every small
-- multiplier vanished in the floor: Trophy rung 2 (+2%) paid nothing at all
-- against any monster of 12 HP or less, floor(10.6 x 1.02) = 10.
--
-- ── THE RULE (game-designer ruling, final) ──────────────────────────────────
-- A per-skill REMAINDER in [0,1), server-owned and projected. Every multiplier
-- is applied to the exact value ONCE, the credit is floor(remainder + grant)
-- and the rest is carried. No RNG: every seeded draw is unchanged. The engine
-- does the arithmetic (fixed point, 1e-6 XP units, so the credit over any N
-- grants is floor(remainder0 + sum) regardless of batching) and proposes the
-- new remainder per skill it moved as the ABSOLUTE delta key `xp_frac`, the
-- `tool_carry` shape.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   §1 player_skills.xp_frac numeric NOT NULL DEFAULT 0, CHECK [0,1). Adding a
--      column with a constant default is a catalogue-only change (no rewrite).
--   §2 hr_apply: `xp_frac` joins the delta-key allowlist; a block after the XP
--      loop validates it exactly as tool_carry is validated (an object, at most
--      c_max_carry_skills keys, catalogue skills, numbers in [0,1) - REFUSED,
--      never clamped: an out-of-range remainder has no honest source, and 900
--      would be a 900-XP mint on the next grant) and upserts it.
--   §3 hr_state_of projects it as `frac` beside `xp` and `level`.
--   §4 self-check by execution on a probe character.
--
-- ── RAISE-AND-CONSUME, AND NO CLIENT WRITE PATH ─────────────────────────────
-- The remainder rises with each grant and is consumed when a whole unit forms;
-- that arithmetic is the engine's, run on the server. The column has exactly
-- one writer, hr_apply (hr_engine-only), from the engine's own delta.
-- `authenticated` holds SELECT on player_skills and nothing else; no client
-- RPC body mentions the column (asserted in §4 by scanning pg_proc); the
-- attended credit hr_credit_combat_xp, every claim and every other XP writer
-- leave it untouched (a row they insert takes the default 0). The client
-- renders the integer and never reads or sends the remainder; its display-only
-- prediction keeps the pre-ruling floor (no new client prediction since
-- 2026-09-16) and is replaced by each envelope.
--
-- ── COST AT 100x PLAYERS ────────────────────────────────────────────────────
-- One numeric per skill row (~15 rows a character, ~8 bytes each). Written
-- only inside the apply that already writes XP, at most once per moved skill.
--
-- RESTATEMENT-DEBT-ACK: hr_apply and hr_state_of are live-hash-tracked bodies
--   patched programmatically. Each anchor is asserted EXACTLY ONCE and each is
--   the smallest region this file can account for: the delta-key line, the end
--   of the XP upsert loop, and the `xp`/`level` pair of the skills projection.
-- ⚠ AFTER APPLYING: re-seed `node tests/live-hash-drift.mjs --live --write`,
--   whys from `--codediff`, and re-pin restore-census (Coordinator).
-- REVERSIBILITY: drop the two patched regions by hand in a follow-up and
--   `alter table public.player_skills drop column xp_frac`; nothing else reads it.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED, ANCHORS EXACTLY ONCE ───────────────────
do $mig$
declare
  v_apply text; v_state text; v_n int;
  c_k constant text := $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',$anc$;
  c_x constant text := $anc$          do update set xp = player_skills.xp + v_n;
      end loop;
    end if;$anc$;
  c_s constant text := $anc$               'xp', xp, 'level', public.hr_level_from_xp(xp)))$anc$;
begin
  if to_regclass('public.player_skills') is null then
    raise exception 'player_skills is missing — apply 2026-08-11-apply-engine.sql first'; end if;
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_apply / hr_state_of missing — apply the engine chain first'; end if;
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  v_state := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  -- The validation this file mirrors must be there, with the constant it reuses.
  if strpos(v_apply, 'c_max_carry_skills') = 0 or strpos(v_apply, 'bad_tool_carry') = 0 then
    raise exception 'hr_apply carries no tool_carry validation — apply 2026-08-15-tool-carry.sql first'; end if;
  if strpos(v_apply, $q$'xp_frac'$q$) = 0 then
    v_n := (length(v_apply) - length(replace(v_apply, c_k, ''))) / length(c_k);
    if v_n <> 1 then
      raise exception 'hr_apply: the delta-key anchor appears % time(s), expected exactly 1', v_n; end if;
    v_n := (length(v_apply) - length(replace(v_apply, c_x, ''))) / length(c_x);
    if v_n <> 1 then
      raise exception 'hr_apply: the XP-loop anchor appears % time(s), expected exactly 1', v_n; end if;
  end if;
  if strpos(v_state, $q$'frac', xp_frac$q$) = 0 then
    v_n := (length(v_state) - length(replace(v_state, c_s, ''))) / length(c_s);
    if v_n <> 1 then
      raise exception 'hr_state_of: the skills-projection anchor appears % time(s), expected exactly 1', v_n; end if;
  end if;
end $mig$;

-- ── 1. THE COLUMN ───────────────────────────────────────────────────────────
alter table public.player_skills
  add column if not exists xp_frac numeric not null default 0;
do $mig$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'player_skills_xp_frac_range_ck'
                    and conrelid = 'public.player_skills'::regclass) then
    alter table public.player_skills
      add constraint player_skills_xp_frac_range_ck check (xp_frac >= 0 and xp_frac < 1);
  end if;
end $mig$;
comment on column public.player_skills.xp_frac is
  'The carried fractional XP remainder, [0,1). Written only by hr_apply from the engine''s '
  'xp_frac delta (2026-10-09-xp-frac-carry.sql); projected by hr_state_of as skills.<id>.frac.';

-- ── 2. hr_apply — ACCEPT, VALIDATE AND WRITE `xp_frac` ─────────────────────
do $mig$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'xp_frac'$q$) > 0 then
    raise notice 'hr_apply already carries xp_frac — patch skipped'; return; end if;
  v_def := replace(v_def,
    $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',$anc$,
    $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',
    -- THE CARRIED XP REMAINDER (2026-10-09-xp-frac-carry.sql): an ABSOLUTE
    -- per-skill map of numbers in [0,1), the tool_carry shape. Engine output,
    -- never client input; validated and written after the XP loop.
    'xp_frac',$anc$);
  v_def := replace(v_def,
    $anc$          do update set xp = player_skills.xp + v_n;
      end loop;
    end if;$anc$,
    $anc$          do update set xp = player_skills.xp + v_n;
      end loop;
    end if;

    -- ── XP REMAINDER (2026-10-09-xp-frac-carry.sql) ─ ABSOLUTE, per skill.
    --    grantXp credits floor(remainder + grant) and carries the rest; this
    --    stores the rest. REFUSED, never clamped, exactly as tool_carry: a
    --    remainder outside [0,1) has no honest source, and 900 would be a
    --    900-XP mint on the next grant. Written AFTER the XP loop so a skill
    --    row the loop just created is updated, not duplicated.
    if p_delta ? 'xp_frac' then
      if jsonb_typeof(p_delta->'xp_frac') <> 'object' then
        perform public.hr_reject('bad_xp_frac',
          jsonb_build_object('type', jsonb_typeof(p_delta->'xp_frac')));
      end if;
      if (select count(*) from jsonb_object_keys(p_delta->'xp_frac')) > c_max_carry_skills then
        perform public.hr_reject('too_many_xp_frac_skills',
          jsonb_build_object('n', (select count(*) from jsonb_object_keys(p_delta->'xp_frac'))));
      end if;
      for k in select key from jsonb_each(p_delta->'xp_frac') loop
        if length(k) not between 1 and 32
           or not exists (select 1 from public.hr_skills where skill_id = k) then
          perform public.hr_reject('unknown_skill', jsonb_build_object('skill_id', k));
        end if;
        if jsonb_typeof(p_delta->'xp_frac'->k) <> 'number'
           or (p_delta->'xp_frac'->>k)::numeric < 0 or (p_delta->'xp_frac'->>k)::numeric >= 1 then
          perform public.hr_reject('bad_xp_frac',
            jsonb_build_object('skill', k, 'value', p_delta->'xp_frac'->k));
        end if;
        -- trunc, never round: round(0.9999996, 6) is 1, which the CHECK refuses.
        insert into public.player_skills (user_id, slot, skill_id, xp, xp_frac)
          values (v_uid, v_slot, k, 0, trunc((p_delta->'xp_frac'->>k)::numeric, 6))
          on conflict (user_id, slot, skill_id)
          do update set xp_frac = excluded.xp_frac;
      end loop;
    end if;$anc$);
  execute v_def;
  raise notice 'hr_apply patched: the xp_frac delta key is validated and stored';
end $mig$;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 3. hr_state_of — PROJECT `frac` BESIDE `xp` AND `level` ────────────────
do $mig$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'frac', xp_frac$q$) > 0 then
    raise notice 'hr_state_of already projects xp_frac — patch skipped'; return; end if;
  v_def := replace(v_def,
    $anc$               'xp', xp, 'level', public.hr_level_from_xp(xp)))$anc$,
    $anc$               'xp', xp, 'level', public.hr_level_from_xp(xp),
               -- THE CARRIED XP REMAINDER (2026-10-09-xp-frac-carry.sql). The
               -- engine's input (envelope.js xpFrac); the client renders `xp`.
               'frac', xp_frac))$anc$);
  execute v_def;
  raise notice 'hr_state_of patched: skills project their carried remainder';
end $mig$;
revoke execute on function public.hr_state_of(uuid, int) from public;
revoke execute on function public.hr_state_of(uuid, int) from anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 4. SELF-CHECK (§4) — BY EXECUTION, ON A PROBE CHARACTER ────────────────
-- Every arm drives a REAL hr_apply / hr_state_of against a fabricated character
-- inside a subtransaction discarded by a sentinel raise (HR946), so the block is
-- net-zero; a leak check runs after it.
do $mig$
declare
  v_r jsonb; v_ver bigint; v_ver2 bigint; v_env jsonb; v_got numeric; v_xp bigint;
  v_names text;
  v_uid constant uuid := '00000000-0000-4000-c000-00000f7ac001';
begin
  -- (a) THE COLUMN AND ITS RANGE, by catalogue.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'player_skills'
                    and column_name = 'xp_frac' and data_type = 'numeric' and is_nullable = 'NO') then
    raise exception 'xp-frac self-check (a): player_skills.xp_frac is missing, not numeric or nullable'; end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'player_skills_xp_frac_range_ck'
                    and conrelid = 'public.player_skills'::regclass and convalidated) then
    raise exception 'xp-frac self-check (a): the [0,1) CHECK is missing'; end if;

  -- (b) NO CLIENT WRITE PATH. No client role may write the column, and no
  --     function body but hr_apply's and hr_state_of's names it — so no client
  --     RPC, no claim and not the attended credit can move it.
  if has_column_privilege('authenticated', 'public.player_skills', 'xp_frac', 'UPDATE')
     or has_column_privilege('authenticated', 'public.player_skills', 'xp_frac', 'INSERT')
     or has_column_privilege('anon', 'public.player_skills', 'xp_frac', 'UPDATE')
     or has_column_privilege('anon', 'public.player_skills', 'xp_frac', 'INSERT') then
    raise exception 'xp-frac self-check (b): a client role can write player_skills.xp_frac'; end if;
  --     NARROWED 2026-10-13 (2026-10-13-party-settle-frac-keys.sql; Security
  --     re-review): hr_party_tick_settle names the key inside its `c_delta_ok`
  --     REFUSAL ALLOWLIST, which writes nothing. That one declaration is cut
  --     out before the scan; any other mention, in that body or any other,
  --     still raises. Required: tests/xp-frac-carry.mjs X6 re-applies this
  --     file on the full chain, where the party allowlist already exists.
  select string_agg(distinct p.proname, ',' order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   cross join lateral (select regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as code) c
   where n.nspname = 'public'
     and (case when p.proname = 'hr_party_tick_settle'
                    -- the carve-out holds only while c_delta_ok is used in
                    -- exactly two places, its declaration and the key check,
                    -- so a writer that reads a name out of it (format %I) is
                    -- scanned in full (Security, 2026-10-13 #4)
                    and (length(c.code) - length(replace(c.code, 'c_delta_ok', ''))) / 10 = 2
                    and strpos(c.code, 'k = any (c_delta_ok)') > 0
               then regexp_replace(p.prosrc, 'c_delta_ok\s+constant\s+text\[\]\s*:=\s*array\[[^]]*\];', '')
               else p.prosrc end) like '%xp\_frac%'
     and p.proname not in ('hr_apply', 'hr_state_of');
  if v_names is not null then
    raise exception 'xp-frac self-check (b): functions other than hr_apply / hr_state_of name xp_frac: % '
                    '— the remainder must have exactly one writer', v_names; end if;
  if has_function_privilege('authenticated', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_state_of(uuid,int)', 'execute')
     or has_function_privilege('anon', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute') then
    raise exception 'xp-frac self-check (b): a client role can execute hr_apply / hr_state_of'; end if;
  if not has_function_privilege('hr_engine', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or not has_function_privilege('hr_engine', 'public.hr_state_of(uuid,int)', 'execute') then
    raise exception 'xp-frac self-check (b): hr_engine lost execute on hr_apply / hr_state_of'; end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    perform public.hr_create_character(0);

    -- (c) A FRESH CHARACTER PROJECTS frac = 0 on every skill (the default).
    v_env := public.hr_state_of(v_uid, 0);
    if coalesce(v_env->>'ok', 'false') <> 'true' then
      raise exception 'xp-frac self-check (c): hr_state_of refused the probe (%)', v_env; end if;
    if (v_env #>> '{skills,attack,frac}')::numeric is distinct from 0 then
      raise exception 'xp-frac self-check (c): a fresh attack cell projects frac %, expected 0',
                      v_env #> '{skills,attack}'; end if;

    -- (d) THE KEY IS ACCEPTED BESIDE XP AND ROUND-TRIPS THROUGH hr_state_of.
    --     `is distinct from`, never `<>`: an absent key reads NULL and `<>`
    --     would pass on a write that never happened.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"xp":{"attack":7},"xp_frac":{"attack":0.612345,"strength":0.25},'
             '"journal":{"kind":"admin","intent":"xp-frac:probe"}}'::jsonb);
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'xp-frac self-check (d): a valid xp_frac delta was REFUSED (%)', v_r; end if;
    v_env := public.hr_state_of(v_uid, 0);
    if (v_env #>> '{skills,attack,frac}')::numeric is distinct from 0.612345
       or (v_env #>> '{skills,strength,frac}')::numeric is distinct from 0.25
       or (v_env #>> '{skills,attack,xp}')::bigint is distinct from 7 then
      raise exception 'xp-frac self-check (d): the remainder did not round-trip: attack %, strength %',
                      v_env #> '{skills,attack}', v_env #> '{skills,strength}'; end if;

    -- (e) AN XP-ONLY DELTA LEAVES THE REMAINDER ALONE (absent key = untouched,
    --     the way every other XP writer behaves), and the XP still lands.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"xp":{"attack":3},"journal":{"kind":"admin","intent":"xp-frac:probe:control"}}'::jsonb);
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'xp-frac self-check (e): the control XP delta was refused (%)', v_r; end if;
    select xp, xp_frac into v_xp, v_got from public.player_skills
     where user_id = v_uid and slot = 0 and skill_id = 'attack';
    if v_xp is distinct from 10 or v_got is distinct from 0.612345 then
      raise exception 'xp-frac self-check (e): an XP-only delta left attack at xp % frac % — expected 10 / '
                      '0.612345', v_xp, v_got; end if;

    -- (f) AN IMPOSSIBLE REMAINDER IS REFUSED — not clamped, not stored, no
    --     version bump. 1 is the boundary that matters: a whole unit never paid.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"xp_frac":{"attack":1},"journal":{"kind":"admin","intent":"xp-frac:probe:one"}}'::jsonb);
    if v_r->>'error' is distinct from 'bad_xp_frac' then
      raise exception 'xp-frac self-check (f): a remainder of exactly 1 returned % — the range is [0,1)', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"xp_frac":{"attack":900},"journal":{"kind":"admin","intent":"xp-frac:probe:900"}}'::jsonb);
    if v_r->>'error' is distinct from 'bad_xp_frac' then
      raise exception 'xp-frac self-check (f): a remainder of 900 returned % — a 900-XP mint', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"xp_frac":{"attack":-0.1},"journal":{"kind":"admin","intent":"xp-frac:probe:neg"}}'::jsonb);
    if v_r->>'error' is distinct from 'bad_xp_frac' then
      raise exception 'xp-frac self-check (f): a negative remainder returned %', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"xp_frac":{"attack":"0.5"},"journal":{"kind":"admin","intent":"xp-frac:probe:str"}}'::jsonb);
    if v_r->>'error' is distinct from 'bad_xp_frac' then
      raise exception 'xp-frac self-check (f): a STRING remainder returned %', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"xp_frac":[0.5],"journal":{"kind":"admin","intent":"xp-frac:probe:arr"}}'::jsonb);
    if v_r->>'error' is distinct from 'bad_xp_frac' then
      raise exception 'xp-frac self-check (f): an ARRAY remainder returned %', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"xp_frac":{"not_a_skill":0.5},"journal":{"kind":"admin","intent":"xp-frac:probe:skill"}}'::jsonb);
    if v_r->>'error' is distinct from 'unknown_skill' then
      raise exception 'xp-frac self-check (f): a remainder on an unknown skill returned %', v_r; end if;
    select xp_frac into v_got from public.player_skills
     where user_id = v_uid and slot = 0 and skill_id = 'attack';
    select version into v_ver2 from public.player_state where user_id = v_uid and slot = 0;
    if v_got is distinct from 0.612345 or v_ver2 <> v_ver then
      raise exception 'xp-frac self-check (f): a REFUSED remainder moved the row (frac %, version % -> %)',
                      v_got, v_ver, v_ver2; end if;

    -- (g) THE TABLE CHECK BITES ON ITS OWN, so a future writer that forgot the
    --     validation still cannot store an out-of-range remainder.
    begin
      update public.player_skills set xp_frac = 1
       where user_id = v_uid and slot = 0 and skill_id = 'attack';
      raise exception 'xp-frac self-check (g): the CHECK accepted xp_frac = 1';
    exception when check_violation then null;
    end;

    -- (h) THE WRITE IS AN OVERWRITE, NEVER AN ADDITION (Security, 2026-10-08).
    --     The engine proposes the ABSOLUTE remainder; an additive upsert would
    --     mint a unit's worth of carry per settle. 0.6 then 0.3 must read 0.3.
    --     (d) alone cannot see this: it writes onto rows still at 0.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"xp_frac":{"defense":0.6},"journal":{"kind":"admin","intent":"xp-frac:probe:h1"}}'::jsonb);
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'xp-frac self-check (h): the first remainder was refused (%)', v_r; end if;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"xp_frac":{"defense":0.3},"journal":{"kind":"admin","intent":"xp-frac:probe:h2"}}'::jsonb);
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'xp-frac self-check (h): the second remainder was refused (%)', v_r; end if;
    select xp_frac into v_got from public.player_skills
     where user_id = v_uid and slot = 0 and skill_id = 'defense';
    if v_got is distinct from 0.3 then
      raise exception 'xp-frac self-check (h): 0.6 then 0.3 stored % — the upsert is not an overwrite', v_got; end if;

    raise exception using errcode = 'HR946', message = 'xp-frac-carry §4 complete — rolling back';
  exception when sqlstate 'HR946' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_skills where user_id = v_uid)
     or exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'xp-frac self-check: §4 LEAKED a probe row'; end if;

  raise notice 'xp-frac-carry self-check PASSED: (a) the column and its [0,1) CHECK; (b) no client role '
               'can write it and only hr_apply / hr_state_of name it; (c) a fresh character projects 0; '
               '(d) a remainder round-trips beside XP; (e) an XP-only delta leaves it alone; (f) 1, 900, '
               '-0.1, a string, an array and an unknown skill are refused without moving the row; (g) the '
               'CHECK bites on its own; (h) the upsert overwrites';
end $mig$;
