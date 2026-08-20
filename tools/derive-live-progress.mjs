// ============================================================================
// tools/derive-live-progress.mjs — BUILD 2026-08-21-streak-state.sql (live-
// progress Slices 2+3, the shared hr_state_of change) by EXTRACTING the CURRENT
// live bodies and patching them at named anchors. Nothing is retyped.
//
//   node tools/derive-live-progress.mjs          # print the derived bodies
//   node tools/derive-live-progress.mjs --write  # (re)write the migration
//   node tools/derive-live-progress.mjs --check  # assert the migration matches
//
// WHY THIS EXISTS — read tools/derive-enchant.mjs's header first. `create or
// replace` on the ~70 KB hr_apply / hr_state_of bodies you have not read
// silently deletes whichever invariant the typist did not know about. This
// script produces bodies that pass tests/run-sql-tests.mjs line by line, plus
// the TWO new things.
//
// SOURCES — THE CURRENT LAST TOUCHERS (both are 2026-08-18-enchant.sql):
//   hr_apply    <- 2026-08-18-enchant.sql
//   hr_state_of <- 2026-08-18-enchant.sql
//
// ── WHAT IT SHIPS ───────────────────────────────────────────────────────────
// Slice 3 — the daily settle STREAK (two player_state columns):
//   · hr_apply advances streak_days / streak_day_key from now() on any ACCRUAL
//     delta (one that carries `accrued_to`). NEVER a client value; no `present`
//     field ever. First-ever=1, same-day no-op, consecutive +1, gap resets to 1.
//   · hr_state_of projects streak_days / streak_day_key.
// The SHARED hr_state_of change (Slice 1 security follow-up + Slice 2):
//   · hr_state_of EXCLUDES `ev:kill_monster:%` AND `ev:loot:%` from its generic
//     progress read — they are served by hr_bestiary_of / hr_collection_of, and
//     together they approach the 1000-row envelope cap. One reviewed change.
//
// ⚠ THIS FILE BECOMES THE LAST TOUCHER OF BOTH hr_apply AND hr_state_of.
// ============================================================================
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'supabase', 'migrations');

const SRC = '2026-08-18-enchant.sql';       // last toucher of BOTH bodies
const TARGET = '2026-08-21-streak-state.sql';

async function fnText(file, open) {
  const sql = (await readFile(join(MIG, file), 'utf8')).replace(/\r\n/g, '\n');
  const i = sql.indexOf(open);
  if (i < 0) throw new Error(`${file}: cannot find ${open}`);
  const j = sql.indexOf('\nend $$;\n', i);
  if (j < 0) throw new Error(`${file}: cannot find the end of ${open}`);
  return sql.slice(i, j + '\nend $$;'.length);
}

function patch(text, anchor, replacement, label) {
  const n = text.split(anchor).length - 1;
  if (n !== 1) throw new Error(`anchor "${label}" matched ${n} times, must match exactly 1`);
  return text.replace(anchor, replacement);
}

export async function deriveApply() {
  let t = await fnText(SRC, 'create or replace function public.hr_apply(');

  // (1) Streak scratch variables, appended after the last declaration.
  t = patch(t, `  v_bud   jsonb;\nbegin`,
    `  v_bud   jsonb;
  -- Slice 3 (docs/design/live-settlement.md): the daily settle STREAK. Advanced
  -- ONLY here, from now(), on any ACCRUAL delta (one that carries accrued_to) —
  -- never a client value, and there is no present:true field. Computed just
  -- before the state UPDATE.
  v_new_streak int;
  v_streak_day text;
begin`,
    'streak scratch variables');

  // (2) Compute the streak, gated on an accrual delta, before the state UPDATE.
  t = patch(t, `    update public.player_state
       set gold = v_new_gold,`,
    `    -- ── (4c) THE DAILY SETTLE STREAK (Slice 3) ───────────────────────────
    -- Advanced from now() on any ACCRUAL delta — one that moves the watermark,
    -- i.e. carries \`accrued_to\`. A live settle, an away collect and a
    -- set_activity collect all carry it; a bare equip / enchant / market intent
    -- does not, and must not bump the streak. NEVER a client value: \`d\` is
    -- hr_utc_day_key(now()), and the "consecutive?" test compares the STORED day
    -- to hr_utc_day_key(now() - 1 day). There is no \`present\` field to forge.
    --   · first ever (streak_day_key null/'')  -> 1
    --   · same UTC day as the stored key        -> unchanged (idempotent)
    --   · stored key == yesterday's key         -> +1
    --   · any larger gap                        -> reset to 1
    v_new_streak := v_st.streak_days;
    v_streak_day := v_st.streak_day_key;
    if p_delta ? 'accrued_to' then
      v_streak_day := public.hr_utc_day_key(now());
      if v_st.streak_day_key is null or v_st.streak_day_key = '' then
        v_new_streak := 1;
      elsif v_st.streak_day_key = v_streak_day then
        v_new_streak := v_st.streak_days;
      elsif v_st.streak_day_key = public.hr_utc_day_key(now() - interval '1 day') then
        v_new_streak := v_st.streak_days + 1;
      else
        v_new_streak := 1;
      end if;
    end if;

    update public.player_state
       set gold = v_new_gold,`,
    'streak computation before the UPDATE');

  // (3) Write the streak columns in the SET clause. Absent accrual = untouched.
  t = patch(t, `           accrued_to   = v_accrued,
           -- b348: an ABSOLUTE, validated at (4a-ii). Absent key = untouched.`,
    `           accrued_to   = v_accrued,
           -- Slice 3: the daily settle streak, advanced above from now() on an
           -- accrual delta only. A non-accrual delta leaves both columns as-is.
           streak_days    = case when p_delta ? 'accrued_to' then v_new_streak else streak_days end,
           streak_day_key = case when p_delta ? 'accrued_to' then v_streak_day else streak_day_key end,
           -- b348: an ABSOLUTE, validated at (4a-ii). Absent key = untouched.`,
    'streak columns in the SET clause');

  return t;
}

export async function deriveStateOf() {
  let t = await fnText(SRC, 'create or replace function public.hr_state_of(');

  // (1) Project the streak next to `fight`.
  t = patch(t, `      'fight', v_st.fight),`,
    `      'fight', v_st.fight,
      -- Slice 3: the daily settle STREAK, server-owned, advanced only inside
      -- hr_apply from now(). Projected so the client can render it; never read
      -- for authority, and there is no present:true field anywhere.
      'streak_days', v_st.streak_days,
      'streak_day_key', v_st.streak_day_key),`,
    'streak in the hr_state_of envelope');

  // (2) EXCLUDE the bestiary + collection populations from the generic progress
  //     READ (they have dedicated projections). The first subquery is the
  //     LIMIT-1000 agg; disambiguated by its `order by` follower.
  t = patch(t, `               where user_id = p_user and slot = v_st.slot
                 and (period_key = '' or updated_at >= now() - interval '31 days')
               order by period_key, kind, key`,
    `               where user_id = p_user and slot = v_st.slot
                 and (period_key = '' or updated_at >= now() - interval '31 days')
                 -- Slices 1+2: the bestiary (ev:kill_monster:%) and collection
                 -- (ev:loot:%) populations are served by hr_bestiary_of /
                 -- hr_collection_of; together they approach the 1000-row cap, so
                 -- they are kept OUT of the generic envelope in one reviewed change.
                 and key not like 'ev:kill_monster:%'
                 and key not like 'ev:loot:%'
               order by period_key, kind, key`,
    'exclude bestiary+collection from the progress agg');

  // (3) The SAME exclusion in the progress_truncated COUNT, or the flag would
  //     count rows the agg no longer returns. Disambiguated by its `limit 1001`.
  t = patch(t, `         where user_id = p_user and slot = v_st.slot
           and (period_key = '' or updated_at >= now() - interval '31 days')
         limit 1001) t),`,
    `         where user_id = p_user and slot = v_st.slot
           and (period_key = '' or updated_at >= now() - interval '31 days')
           and key not like 'ev:kill_monster:%'
           and key not like 'ev:loot:%'
         limit 1001) t),`,
    'exclude bestiary+collection from progress_truncated');

  return t;
}

function migration(apply, stateOf) {
  return `-- ============================================================================
-- 2026-08-21-streak-state.sql — LIVE-PROGRESS Slices 2+3, the SHARED hr_state_of
-- change: the daily settle STREAK (Slice 3) + excluding the bestiary/collection
-- populations from the generic progress envelope (Slice 1 follow-up + Slice 2).
--
-- Governing rule: CLAUDE.md "Server authority (locked 2026-08-10)".
-- docs/design/live-settlement.md.
--
-- ⚠ GENERATED. The restated hr_apply / hr_state_of below are produced by
--   \`node tools/derive-live-progress.mjs --write\` from the CURRENT last toucher
--   (2026-08-18-enchant.sql) and patched at named anchors. Do NOT hand-edit;
--   \`--check\` runs in the suite and will fail. Retyping either body is how a
--   load-bearing invariant silently disappears.
--
-- ── WHAT SHIPS ───────────────────────────────────────────────────────────────
--   §1a  player_state.streak_days int not null default 0, streak_day_key text
--        — server-owned, written ONLY by hr_apply from now().
--   §1b  hr_state_of — projects streak_days/streak_day_key, and EXCLUDES
--        ev:kill_monster:% AND ev:loot:% from the generic progress read (both the
--        LIMIT-1000 agg and the progress_truncated count), since those are served
--        by hr_bestiary_of / hr_collection_of and together approach the cap.
--   §1c  hr_apply — advances the streak from now() on any accrual delta (one
--        carrying accrued_to). First-ever=1, same-day no-op, consecutive +1,
--        gap resets to 1. NEVER a client value; no present:true field.
--
-- ── APPLY ORDER ──────────────────────────────────────────────────────────────
--   ... -> 2026-08-18-enchant.sql (predecessor of BOTH bodies)
--       -> 2026-08-20-bestiary.sql / 2026-08-21-collection.sql (the two
--          projections whose populations this file excludes; ORDER-independent
--          of them, but the exclusion is only useful once they exist)
--       -> THIS FILE
--   §0 fails closed if the live bodies are not the enchant ones.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
-- Additive. The two columns default to 0 / NULL and are read-as-they-are; no
-- existing row is touched. Reverting means re-applying 2026-08-18-enchant.sql
-- (restores both bodies); the columns may be left in place harmlessly. The
-- streak simply stops advancing and the excluded prefixes return to the generic
-- envelope (redundant with the projections, not wrong).
--
-- ⚠ THIS FILE IS NOW THE LAST TOUCHER OF hr_apply AND hr_state_of.
-- ============================================================================

-- ── 0. PRECONDITIONS + LAST-TOUCHER SELF-CHECK — FAIL CLOSED ─────────────
do $$
declare v_apply text; v_state text; v_need text;
begin
  select prosrc into v_apply from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';
  select prosrc into v_state from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';
  if v_apply is null then raise exception 'hr_apply does not exist — apply the player-state chain first'; end if;
  if v_state is null then raise exception 'hr_state_of does not exist — apply the player-state chain first'; end if;

  -- The bodies we are about to REPLACE must be the enchant ones.
  if position('p_delta ? ''enchant''' in v_apply) = 0 then
    raise exception 'the LIVE hr_apply is not the enchant body (no enchant block) — apply 2026-08-18-enchant.sql first';
  end if;
  if position('''enchant'', coalesce(v_st.enchant' in v_state) = 0 then
    raise exception 'the LIVE hr_state_of is not the enchant body (no enchant field) — apply 2026-08-18-enchant.sql first';
  end if;

  -- Idempotence note.
  if position('streak_days' in v_apply) > 0 then
    raise notice 'the streak block is already present — this apply is a no-op replace';
  end if;
end $$;

-- ── 1a. THE SERVER-OWNED STREAK STATE ────────────────────────────────────
-- Two columns, additive. streak_days is the count; streak_day_key is the UTC
-- day key (hr_utc_day_key form) of the last settle that advanced it. Written
-- ONLY by hr_apply from now(); there is no client write policy or grant on
-- player_state (asserted in §3), so this is authoritative and unforgeable.
alter table public.player_state
  add column if not exists streak_days int not null default 0;
alter table public.player_state
  add column if not exists streak_day_key text;

-- ── 1b. hr_state_of — GENERATED. Do not hand-edit; see the header. ───────
${stateOf}
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 1c. hr_apply — GENERATED. Do not hand-edit; see the header. ──────────
${apply}

-- ── 2. GRANTS ON hr_apply — revoke from PUBLIC first, then grant ─────────
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 3. SELF-VERIFICATION — THE COMMIT GATE ───────────────────────────────
do $$
declare v_apply text; v_state text; v_bad text; v_missing text; v_n int;
begin
  select prosrc into v_apply from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';
  select prosrc into v_state from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';

  -- (a) THE hr_apply THAT LANDED CARRIES EVERYTHING THE ENCHANT BODY HAD, plus
  --     this file's own change. A control set from every prior chain.
  foreach v_bad in array array[
    'on conflict (user_id, slot, skill_id)', 'c_release_codes', 'v_fight',
    'tool_carry', 'hr_day_budget_check', 'c_max_xp_delta', 'player_equipment',
    'p_delta ? ''enchant''', 'public.hr_runes', 'v_enchant_el',
    -- this file's change:
    'v_new_streak', 'v_streak_day', 'hr_utc_day_key(now())',
    'streak_days    = case when p_delta ? ''accrued_to''']
  loop
    if position(v_bad in v_apply) = 0 then
      raise exception 'the hr_apply that landed does not contain "%" — the restatement in §1c is wrong', v_bad;
    end if;
  end loop;

  -- (b) THE STREAK IS ADVANCED ONLY FROM now() AND ONLY ON AN ACCRUAL DELTA,
  --     and NO present:true field exists. The gate is p_delta ? 'accrued_to'.
  if position('if p_delta ? ''accrued_to'' then' in v_apply) = 0 then
    raise exception 'the streak is not gated on an accrual delta — a non-settle intent would bump it';
  end if;
  if position('? ''present''' in v_apply) > 0
     or position('->>''present''' in v_apply) > 0
     or position('->''present''' in v_apply) > 0 then
    raise exception 'hr_apply reads a client "present" delta key — the streak must derive from now() only';
  end if;

  -- (c) hr_state_of PROJECTS the streak and EXCLUDES BOTH prefixes from the
  --     generic read (agg AND truncated count — two occurrences each).
  if position('''streak_days'', v_st.streak_days' in v_state) = 0
     or position('''streak_day_key'', v_st.streak_day_key' in v_state) = 0 then
    raise exception 'hr_state_of does not project the streak — the client could not render it';
  end if;
  select count(*) into v_n from regexp_matches(v_state, 'not like ''ev:kill_monster:%''', 'g');
  if v_n <> 2 then
    raise exception 'ev:kill_monster:%% is excluded % times, expected 2 (the agg AND the truncated count)', v_n;
  end if;
  select count(*) into v_n from regexp_matches(v_state, 'not like ''ev:loot:%''', 'g');
  if v_n <> 2 then
    raise exception 'ev:loot:%% is excluded % times, expected 2 (the agg AND the truncated count)', v_n;
  end if;
  -- The enchant field must still be projected — this file did not delete it.
  if position('''enchant'', coalesce(v_st.enchant' in v_state) = 0 then
    raise exception 'hr_state_of lost the enchant field — the restatement in §1b is wrong';
  end if;

  -- (d) THE COLUMNS EXIST WITH THE RIGHT SHAPE.
  select count(*) into v_n from information_schema.columns
   where table_schema='public' and table_name='player_state'
     and column_name='streak_days' and data_type='integer' and is_nullable='NO';
  if v_n <> 1 then raise exception 'player_state.streak_days is missing / not a NOT NULL integer'; end if;
  select count(*) into v_n from information_schema.columns
   where table_schema='public' and table_name='player_state'
     and column_name='streak_day_key' and data_type='text';
  if v_n <> 1 then raise exception 'player_state.streak_day_key is missing / not text'; end if;

  -- (e) NEITHER PRIVILEGED RPC IS CLIENT-EXECUTABLE.
  for v_missing in select unnest(array['anon','authenticated','service_role','public']) loop
    if has_function_privilege(v_missing, 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute') then
      raise exception 'hr_apply is EXECUTABLE by % — that is the whole game', v_missing;
    end if;
    if has_function_privilege(v_missing, 'public.hr_state_of(uuid,integer)', 'execute') then
      raise exception 'hr_state_of is EXECUTABLE by %', v_missing;
    end if;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute') then
    raise exception 'hr_engine cannot execute hr_apply — every intent would 500';
  end if;

  -- (f) NO CLIENT WRITE POLICY OR GRANT ON player_state. The streak columns are
  --     written only by hr_apply; a client that could write player_state could
  --     author its own streak.
  select count(*) into v_n from pg_policies
   where schemaname='public' and tablename='player_state'
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_n > 0 then raise exception '% client write policies on player_state', v_n; end if;
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema='public' and table_name='player_state'
     and grantee in ('anon','authenticated','PUBLIC')
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v_n > 0 then raise exception '% client write grants on player_state', v_n; end if;

  -- (g) BEHAVIOUR IS ASSERTED IN THE TEST, NOT HERE. Driving hr_apply through a
  --     settle journals a player_ledger row, and player_ledger carries
  --     hr_ledger_immutable (BEFORE DELETE/UPDATE) — so a self-check that drove a
  --     real settle could not tear its fixture down and would leave a synthetic
  --     character + ledger rows in PRODUCTION on apply. The structural asserts
  --     above prove the streak block LANDED; STREAK-1 in tests/goal-counters.mjs
  --     drives the settle sequence (first=1, same-day idempotent, consecutive +1,
  --     gap resets) against the throwaway replay database, where teardown is free.
  raise notice 'STREAK OK — streak block present, gated on an accrual delta from now(), no client present field, hr_state_of projects the streak and excludes both projection prefixes, columns present, RPCs not client-executable.';
end $$;
`;
}

const SELF = process.argv[1]
  && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const apply = await deriveApply();
  const stateOf = await deriveStateOf();
  if (process.argv.includes('--write')) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(MIG, TARGET), migration(apply, stateOf), 'utf8');
    console.log(`wrote supabase/migrations/${TARGET}`);
  } else if (process.argv.includes('--check')) {
    const mig = (await readFile(join(MIG, TARGET), 'utf8')).replace(/\r\n/g, '\n');
    if (!mig.includes(apply)) {
      console.error(`DRIFT: ${TARGET}'s hr_apply is not what this script derives from ${SRC}.`);
      process.exit(1);
    }
    if (!mig.includes(stateOf)) {
      console.error(`DRIFT: ${TARGET}'s hr_state_of is not what this script derives from ${SRC}.`);
      process.exit(1);
    }
    console.log(`derive-live-progress: ${TARGET} matches (hr_apply ${apply.length} B, hr_state_of ${stateOf.length} B)`);
  } else {
    console.log(apply);
    console.log('\n\n-- ===== hr_state_of =====\n');
    console.log(stateOf);
  }
}
