// ============================================================================
// tools/derive-fight-carry.mjs — BUILD the hr_apply + hr_state_of bodies for
// 2026-08-17-fight-carry.sql by EXTRACTING the current live bodies and patching
// them at named anchors. Nothing is retyped.
//
//   node tools/derive-fight-carry.mjs          # print the two sections
//   node tools/derive-fight-carry.mjs --check  # assert the migration still
//                                              # contains exactly what this
//                                              # script derives
//
// WHY THIS EXISTS. `create or replace` on a 55 KB body you have not read is the
// single most destructive statement in this repo: the body carries b346's
// ownership flag, b348's tool_carry key, the S5 accrued_to stamp, the 12M XP
// clamp and the daily budget, and a hand-retyped restatement silently deletes
// whichever of them the typist did not know about. tests/run-sql-tests.mjs
// PART 1f-ii grades the result line by line; this is what produces something
// that can pass it.
//
// SOURCES, and they are the CURRENT LAST TOUCHERS (verified in the same file):
//   hr_apply     <- supabase/migrations/2026-08-15-gem-daily-budget.sql
//   hr_state_of  <- supabase/migrations/2026-08-15-tool-carry.sql
// ============================================================================
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'supabase', 'migrations');

const APPLY_SRC = '2026-08-15-gem-daily-budget.sql';
const STATE_SRC = '2026-08-15-tool-carry.sql';
const TARGET = '2026-08-17-fight-carry.sql';

async function fnText(file, open) {
  const sql = (await readFile(join(MIG, file), 'utf8')).replace(/\r\n/g, '\n');
  const i = sql.indexOf(open);
  if (i < 0) throw new Error(`${file}: cannot find ${open}`);
  const j = sql.indexOf('\nend $$;\n', i);
  if (j < 0) throw new Error(`${file}: cannot find the end of ${open}`);
  return sql.slice(i, j + '\nend $$;'.length);
}

/* Every patch must match EXACTLY ONCE. A patch that matches twice would edit a
   line somebody else's fix depends on; a patch that matches zero times means
   the anchor moved and the derivation silently produced the OLD body under a
   new filename — which is the failure mode this whole convention exists to
   prevent, and it is why this throws rather than warns. */
function patch(text, anchor, replacement, label) {
  const n = text.split(anchor).length - 1;
  if (n !== 1) throw new Error(`anchor "${label}" matched ${n} times, must match exactly 1`);
  return text.replace(anchor, replacement);
}

// ── hr_apply, patched at FIVE anchors ──────────────────────────────────────
export async function deriveApply() {
  let t = await fnText(APPLY_SRC, 'create or replace function public.hr_apply(');

  // (1) c_delta_keys gains 'fight'. THE ONLY DECLARED REMOVAL in this link.
  t = patch(t, `    'tool_carry'];`,
    `    'tool_carry',
    -- Phase 0 (docs/design/live-settlement.md): the IN-FLIGHT FIGHT. Engine
    -- output, never client input, and an ABSOLUTE like tool_carry. Validated
    -- at (4a-iii) and VOIDED unconditionally by an activity change.
    'fight'];`, 'c_delta_keys gains fight');

  // (2) the declares.
  t = patch(t, `  v_carry jsonb;\n`,
    `  v_carry jsonb;
  -- Phase 0. The proposed in-flight fight, and the ceiling its HP is re-derived
  -- against. \`v_fight_max\` comes out of hr_activities — the GENERATED
  -- catalogue — so the clamp is a fact about src/data/monsters.js rather than a
  -- number somebody typed into SQL and stopped maintaining.
  v_fight jsonb;
  v_fight_max int;
`, 'declare v_fight');

  t = patch(t, `  c_max_carry_skills constant int := 32;\n`,
    `  c_max_carry_skills constant int := 32;
  -- A blast radius on the carried kill counter, not a balance number. It drives
  -- nothing in the simulation today (resolveKill increments it, nothing reads
  -- it) and is carried so the streak readout survives the cutover; the clamp is
  -- here so an engine bug cannot store a counter nobody can explain.
  c_max_fight_kills constant bigint := 1000000;
  -- ⚠ THE INTENT KEYS A REJECTION MUST RELEASE (Security F3, 2026-08-16).
  --   Step (5) releases a claimed key on \`version_conflict\` because the accrual
  --   engine DERIVES its key from (user, slot, watermark, version, salt) and a
  --   rejection moves neither watermark nor version — so an honest retry
  --   re-derives a byte-identical key and replays the stored rejection until
  --   hr_intents_prune, up to 25 hours later.
  --
  --   The \`fight\` codes have exactly that shape, and the trigger is a ROUTINE
  --   OPERATION rather than an attack: change a monster's hp in
  --   src/data/monsters.js and deploy the Edge payload BEFORE re-applying
  --   2026-08-11-catalogue.generated.sql, and every honest checkpoint for that
  --   monster proposes an hp above the stale ceiling. Refused, key bricked,
  --   every player on that monster frozen for a day — and re-applying the
  --   catalogue would NOT unfreeze them, because the replay never re-evaluates.
  --
  --   THE RULE, STATED AS A PROPERTY RATHER THAN AS A LIST: release a claimed
  --   key when the refusal is a function of SERVER STATE THAT CAN CHANGE
  --   UNDERNEATH AN UNCHANGED DELTA — the row version, or the catalogue the
  --   clamp is re-derived from. Everything else is a decision about the delta
  --   itself and deserves the same answer on the same key. Nothing is released
  --   that EXECUTED anything: a rejection rolled the protected block back, so a
  --   re-run is a first run.
  c_release_codes constant text[] := array[
    'version_conflict',
    'bad_fight', 'bad_fight_hp', 'bad_fight_kills', 'unknown_monster'];
`, 'declare c_max_fight_kills');

  // (3) the validation, immediately after the tool-carry block.
  t = patch(t, `\n    -- ── (4b) THE LEDGER-DERIVED DAILY BUDGET (C5 / X3) ───────────────────`,
    `
    -- ── (4a-iii) THE IN-FLIGHT FIGHT (Phase 0) ───────────────────────────
    -- Carrying a partial fight across accrual windows is what stops a monster
    -- whose time-to-kill exceeds the window from paying ZERO forever. Measured
    -- (tools/probe-live-settle.mjs P3): a 520 HP dragon against mediocre
    -- offence takes ~488 ticks — about 20 minutes — for one kill. One 60-minute
    -- window pays 1 kill / 575 gold; sixty 60-second windows paid 0 kills /
    -- 0 gold / 0 XP, at every cadence, indefinitely.
    --
    -- ⚠ THE PROPOSAL IS CHECKED, NOT TRUSTED, and this is the whole reason the
    --   key exists in the delta contract rather than being written by the Edge
    --   Function directly. \`hp\` is re-clamped against the ACTUAL monster's HP
    --   re-derived from hr_activities here, in SQL, under the row lock — not
    --   against a maximum the engine sent alongside it. A forged \`fight\` is
    --   worth a mint otherwise: name the highest-value boss, claim 1 HP, and
    --   every window kills it on the first swing.
    --
    -- ⚠ REFUSED, NEVER CLAMPED. There is no honest way for the engine to
    --   propose 9,999 HP on a 520 HP dragon, and silently repairing an
    --   impossible value is how a compromised engine's bug becomes the server's
    --   opinion — the same posture as bad_tool_carry, and the same cost
    --   (\`bad_fight*\` is not on index.ts's DEGRADABLE list, so it 409s the
    --   window rather than shortening it).
    if p_delta ? 'fight' then
      v_fight := p_delta->'fight';
      if jsonb_typeof(v_fight) <> 'object' then
        perform public.hr_reject('bad_fight', jsonb_build_object('type', jsonb_typeof(v_fight)));
      end if;
      -- '{}' is the explicit VOID and is always legal — it is how the engine
      -- says "the fight ended", which a death, a stop and a monster on exactly
      -- 0 HP all are.
      if v_fight <> '{}'::jsonb then
        if exists (select 1 from jsonb_object_keys(v_fight) as t(fk)
                    where fk not in ('monster','hp','kills')) then
          perform public.hr_reject('bad_fight', jsonb_build_object('why', 'unknown key'));
        end if;
        -- ⚠ PRESENCE BEFORE TYPE, AND IT IS NOT BELT-AND-BRACES. Security
        --   F2, 2026-08-16: \`jsonb_typeof(v_fight->'hp')\` of an ABSENT key is
        --   SQL NULL, \`NULL <> 'number'\` is NULL, and \`NULL or NULL or NULL\`
        --   is NULL — so the type gate below never fired for a key that simply
        --   was not there. \`{"monster":"dragon","kills":0}\` was ACCEPTED, and
        --   because \`(v_fight->>'hp')::numeric\` is likewise NULL, every
        --   comparison in the CEILING CHECK was NULL too: the clamp was skipped
        --   entirely and a checkpoint with no HP at all was stored. It was an
        --   under-payment rather than a mint only because normaliseFight
        --   independently refuses a missing hp — i.e. the database's gate was
        --   decorative and the Edge Function was the only thing holding, which
        --   is the exact inversion of this file's whole posture.
        --   Three-valued logic is why a gate must test PRESENCE explicitly.
        if not (v_fight ? 'monster' and v_fight ? 'hp' and v_fight ? 'kills') then
          perform public.hr_reject('bad_fight', jsonb_build_object('why', 'missing key',
            'keys', (select coalesce(jsonb_agg(fk order by fk), '[]'::jsonb)
                       from jsonb_object_keys(v_fight) as t(fk))));
        end if;
        if jsonb_typeof(v_fight->'monster') <> 'string'
           or jsonb_typeof(v_fight->'hp') <> 'number'
           or jsonb_typeof(v_fight->'kills') <> 'number' then
          perform public.hr_reject('bad_fight', jsonb_build_object('why', 'shape'));
        end if;
        -- THE CEILING, RE-DERIVED. A non-combat activity id has a NULL max_hp
        -- by construction (the generator asserts both directions), so this same
        -- lookup also refuses a fight that names a tree or a recipe.
        select max_hp into v_fight_max from public.hr_activities
         where kind = 'combat' and activity_id = v_fight->>'monster';
        if v_fight_max is null then
          perform public.hr_reject('unknown_monster',
            jsonb_build_object('id', v_fight->>'monster'));
        end if;
        if (v_fight->>'hp')::numeric <> trunc((v_fight->>'hp')::numeric)
           or (v_fight->>'hp')::numeric < 1
           or (v_fight->>'hp')::numeric > v_fight_max then
          perform public.hr_reject('bad_fight_hp', jsonb_build_object(
            'id', v_fight->>'monster', 'hp', v_fight->'hp', 'max_hp', v_fight_max));
        end if;
        if (v_fight->>'kills')::numeric <> trunc((v_fight->>'kills')::numeric)
           or (v_fight->>'kills')::numeric < 0
           or (v_fight->>'kills')::numeric > c_max_fight_kills then
          perform public.hr_reject('bad_fight_kills',
            jsonb_build_object('kills', v_fight->'kills'));
        end if;
      end if;
    end if;

    -- ── (4b) THE LEDGER-DERIVED DAILY BUDGET (C5 / X3) ───────────────────`,
    'the (4a-iii) fight validation');

  // (4) the UPDATE writes it, with the activity arm FIRST.
  t = patch(t, `           tool_carry   = case when p_delta ? 'tool_carry'
                               then v_carry else tool_carry end,
`,
    `           tool_carry   = case when p_delta ? 'tool_carry'
                               then v_carry else tool_carry end,
           -- Phase 0: an ABSOLUTE, validated at (4a-iii). Absent key =
           -- untouched.
           -- ⚠ THE \`activity\` ARM IS FIRST AND IT IS UNCONDITIONAL. A delta
           --   that changes the activity VOIDS the fight even if it also
           --   carries a \`fight\` key, so the two cannot be combined into
           --   "switch away and keep the boss". This is the answer to the
           --   exploit question the design names: a player banks a nearly-dead
           --   dragon, switches to slimes, switches back — and the dragon is at
           --   full HP, because the switch that collected the partial also
           --   discarded it. It costs the honest player at most one partial
           --   fight per deliberate re-target.
           fight        = case when p_delta ? 'activity' then '{}'::jsonb
                               when p_delta ? 'fight'    then v_fight
                               else fight end,
`, 'the player_state UPDATE writes fight');

  // (5) the post-state VOID, read off the row rather than off the delta.
  t = patch(t, `     where user_id = v_uid and slot = v_slot;

    -- ── JOURNAL ─ ONE row per apply.`,
    `     where user_id = v_uid and slot = v_slot;

    -- ── THE VOID (Phase 0) — the SECOND, INDEPENDENT half of the rule ────
    -- The CASE above is a statement about the DELTA. This is a statement about
    -- the ROW AS IT NOW STANDS, and it holds no matter which key wrote what: a
    -- fight may survive only while the character is still in combat AND still
    -- facing the same monster. It closes the case the delta arm cannot see —
    -- an activity that was changed by an earlier call, a row left inconsistent
    -- by an admin fix, a future delta key that moves the pointer without using
    -- 'activity'. Two mechanisms, neither load-bearing alone; a reviewer trying
    -- to bank a boss has to defeat both.
    --
    -- It can only ever REMOVE value, so it is safe to run unconditionally. No
    -- version bump: the row is already locked and the UPDATE above bumped it,
    -- and hr_state_of is read AFTER this, so the envelope reflects the void.
    update public.player_state
       set fight = '{}'::jsonb
     where user_id = v_uid and slot = v_slot
       and fight <> '{}'::jsonb
       and (active_kind is distinct from 'combat'
            or active_id is distinct from (fight->>'monster'));

    -- ── JOURNAL ─ ONE row per apply.`, 'the post-state void');

  // (6) THE INTENT-KEY RELEASE CLASS (Security F3). ONE line replaced. The
  // reasoning lives on `c_release_codes` in the declare patch above; the long
  // comment block that already sits over this branch is left VERBATIM, because
  // every word of it is still true and it is the record of why the release
  // exists at all.
  t = patch(t, `     and v_out->>'error' = 'version_conflict' then`,
    `     and v_out->>'error' = any (c_release_codes) then`,
    'the intent-key release class');

  return t;
}

// ── hr_state_of, patched at ONE anchor ─────────────────────────────────────
export async function deriveStateOf() {
  let t = await fnText(STATE_SRC, 'create or replace function public.hr_state_of(');
  t = patch(t, `      'tool_carry', v_st.tool_carry),`,
    `      'tool_carry', v_st.tool_carry,
      -- Phase 0: THE IN-FLIGHT FIGHT. Its presence here is what tells the
      -- accrual engine the server owns the fight — \`st.fight ?? null\`, and the
      -- null branch omits the delta key, exactly as tool_carry does. Never
      -- nested, for the same reason the auto-eat keys are flat.
      'fight', v_st.fight),`, 'hr_state_of gains fight');
  return t;
}

// ── THE WHOLE MIGRATION ────────────────────────────────────────────────────
// Assembled here rather than hand-written around a pasted body, so the two
// restated functions in the file are provably the output of the patches above
// and `--check` can prove it on every suite run.
function migration(state, apply) {
  return `-- ============================================================================
-- 2026-08-17-fight-carry.sql — PHASE 0 OF LIVE SETTLEMENT: the in-progress
-- fight becomes SERVER state, carried across accrual windows.
--
-- Spec: docs/design/live-settlement.md §0 (finding P3) and §2.2, §10 PHASE 0.
-- Governing rule: CLAUDE.md "Server authority (locked 2026-08-10)".
--
-- ⚠ GENERATED. Both restated bodies below are produced by
--   \`node tools/derive-fight-carry.mjs --write\` from the CURRENT last touchers
--   (hr_apply <- 2026-08-15-gem-daily-budget.sql, hr_state_of <-
--   2026-08-15-tool-carry.sql) and patched at named anchors. Do NOT hand-edit
--   them; \`--check\` runs in the suite and will fail. Retyping a 55 KB body is
--   how b346's ownership flag, b348's tool_carry key, the S5 accrued_to stamp
--   and the 12M XP clamp silently disappear.
--
-- ── THE DEFECT, MEASURED ────────────────────────────────────────────────
-- \`computeAccrual\` built \`state = { monsterHp: 0, monsterMaxHp: 0 }\` on every
-- call, because player_state had nowhere to keep a fight in flight. Every span
-- therefore started a FRESH monster at full HP and discarded all damage dealt
-- since the last watermark. Measured with tools/probe-live-settle.mjs against a
-- 520 HP dragon and a mediocre-offence character (~488 ticks, ~20 minutes, per
-- kill):
--
--     one 60-minute window        3 kills   1,545 gold
--     sixty  60-second settles    0 kills       0 gold
--     forty  90-second settles    0 kills       0 gold
--     thirty 120-second settles   0 kills       0 gold
--     twelve 300-second settles   0 kills       0 gold
--
-- Zero at every cadence, indefinitely. It is a total confiscation for exactly
-- the bosses and above-level targets a present player fights, and it is a LIVE
-- under-payment today on every \`set_activity\` collect — a player who re-targets
-- mid-fight already loses the partial. Phase 1 (interval settling) cannot ship
-- before it; shipping settling first would be shipping a regression.
--
-- With the carry, the same fixture pays 3 kills at 60 s, 90 s, 120 s and 300 s
-- — identical to the single 60-minute window, which is the property: a settled
-- span is the same simulation started from a checkpoint.
--
-- ── WHAT IT SHIPS ───────────────────────────────────────────────────────
--   §1  player_state.fight        jsonb not null default '{}'
--   §2  hr_activities.max_hp      (in 2026-08-11-catalogue.generated.sql — the
--                                  GENERATED monster-HP ceiling this file's
--                                  re-clamp is derived against; asserted here)
--   §3  hr_state_of               projects \`fight\`
--   §4  hr_apply                  the \`fight\` delta key, the re-clamp, and TWO
--                                 independent void rules
--   §5  grants                    revoke from PUBLIC first, then hr_engine
--   §6  self-verification         the commit gate
--
-- ── ONE COLUMN, NOT THREE — A STATED DEVIATION FROM THE SPEC ────────────
-- §2.2 of the spec names three columns (\`fight_monster\`, \`fight_hp\`,
-- \`fight_kills\`). This ships ONE jsonb column, for two reasons:
--
--   1. THE SELF-CONFIGURING SWITCH NEEDS A NON-NULL CONTAINER. The spec's own
--      §2.2 relies on "absent column -> hr_state_of returns undefined -> the
--      engine starts fresh and omits the delta key", which is what removes the
--      ordering hazard between the migration and the deploy. Three NULLABLE
--      columns make "the column does not exist" and "there is no fight in
--      flight" the same observation — \`st.fight_hp ?? null\` is null in both
--      cases — so the switch stops working at exactly the moment it matters.
--      \`fight jsonb not null default '{}'\` is unambiguous: null means no
--      column, \`{}\` means no fight. It is byte-for-byte the \`tool_carry\`
--      pattern, which is the shape the spec says it is copying.
--   2. THE TRIPLE IS ONE FACT, WRITTEN AND READ ATOMICALLY. Three columns admit
--      eight states of which two are legal (all null / all set); one jsonb
--      object admits the container by CHECK and the contents by the validation
--      at (4a-iii). There is no partial-write to reason about and no
--      "fight_hp set, fight_monster null" row for a future reader to guess at.
--
-- The delta key is \`fight\` either way, which is what the spec actually names.
--
-- ── AND \`hr_monsters\` DOES NOT EXIST — THE SECOND DEVIATION ─────────────
-- The spec says hr_apply must re-clamp \`fight_hp\` into
-- \`[0, monsters[fight_monster].hp]\` "re-derived from hr_monsters". There is no
-- hr_monsters table and never was: the server held NO monster HP anywhere, so
-- the re-clamp as specified was not expressible in SQL. Rather than trust the
-- engine (which would make the whole key a mint: name the highest-value boss,
-- claim 1 HP, kill it on the first swing of every window), the ceiling is now a
-- GENERATED column — \`hr_activities.max_hp\`, emitted by tools/gen-catalogues.mjs
-- from src/data/monsters.js, null for every non-combat row, count-asserted in
-- the generated file so a re-apply cannot leave it null and make this clamp
-- vacuous. No game data is duplicated into SQL by hand.
--
-- ⚠⚠ STANDING RULE — A MONSTER'S HP IS NOW A DEPLOY-ORDER DEPENDENCY ⚠⚠
--
-- **Any change to a monster's \`hp\` in src/data/monsters.js requires re-applying
-- 2026-08-11-catalogue.generated.sql BEFORE the Edge payload deploys.**
--
-- SHIP ORDER, PINNED, EVERY TIME:
--     1. node tools/gen-catalogues.mjs      (regenerate)
--     2. apply 2026-08-11-catalogue.generated.sql   (the ceiling moves)
--     3. apply 2026-08-17-fight-carry.sql           (first time only)
--     4. deploy the Edge payload                    (the engine proposes)
--
-- WHY, AND IT IS NOT THEORETICAL. \`hr_activities.max_hp\` is the ceiling this
-- file re-derives a carried \`fight.hp\` against. The Edge engine seeds and emits
-- that hp from \`src/data/monsters.js\`. Raise a monster's HP in the payload
-- first and every honest checkpoint for that monster proposes an hp ABOVE the
-- stale ceiling: refused \`bad_fight_hp\`, which is not on index.ts's DEGRADABLE
-- list, so it 409s the whole window rather than shortening it — for every
-- player fighting that monster, at every settle.
--
-- Lowering a monster's HP payload-first is the mirror and is quieter, which is
-- worse: the ceiling stays high, forged and stale checkpoints above the new
-- maximum are admitted, and the clamp is simply wider than the game.
--
-- The blast radius of getting this wrong is bounded to ONE window per player
-- rather than to a day, because \`bad_fight*\` is in \`c_release_codes\` and
-- releases the intent key (Security F3) — but a bounded outage is still an
-- outage, and the fix for it is this ordering, not that release.
--
-- ── THE EXPLOIT QUESTION, ANSWERED IN THE DESIGN ────────────────────────
-- "Can a player bank a nearly-dead high-value boss and re-enter it cheaply?"
-- No, and it is refused by TWO independent mechanisms rather than one:
--   (a) the UPDATE's \`fight\` CASE puts the \`activity\` arm FIRST and
--       UNCONDITIONALLY, so a delta that changes the activity voids the fight
--       even when it also carries a \`fight\` key. Every switch carries an
--       activity key, including a switch back to the same monster.
--   (b) a second statement voids any surviving fight that disagrees with the
--       row AS IT NOW STANDS — not in combat, or not facing that monster.
-- Plus the engine's own fail-closed \`fight.monster === activeId\` guard on the
-- read side, which is a third and is deliberately not counted here: it is in
-- the Edge Function, and an Edge Function is exactly the thing this file
-- refuses to trust.
--
-- ⚠ ROUTE TO SECURITY BEFORE DEPLOY. The design gate in §10 PHASE 0 is
--   REQUIRED and this file has not passed it.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────
-- Additive. The column is new; the two bodies are supersets of the ones they
-- replace. Reverting the Edge payload leaves the column unread and unwritten
-- (the engine omits the key when the input is null, and an old payload never
-- sends it), so the database is inert with an old function deployed. Reverting
-- the MIGRATION means re-applying 2026-08-15-gem-daily-budget.sql +
-- 2026-08-15-tool-carry.sql in that order and dropping the column; a deployed
-- engine would then propose \`fight\` at an hr_apply that refuses unknown keys,
-- so revert the payload FIRST. Stated because the safe order is not the
-- obvious one.
--
-- ⚠ THIS FILE IS NOW THE LAST ONE THAT REPLACES hr_apply AND hr_state_of. A
--   later file that also replaces either would silently delete this change.
--   That ordering lives in tests/schema-apply-order.json and both chains in
--   tests/run-sql-tests.mjs, and is enforced by the replay.
-- ============================================================================

-- ── 0. PRECONDITIONS + THE LAST-TOUCHER SELF-CHECK — FAIL CLOSED ─────────
-- Refuse to install if the body we are about to REPLACE is not the one this
-- file was derived from. §0 checks before the replace; §6 checks after. The
-- pair is a gate rather than a hope.
do $$
declare
  v_src text;
  v_term text[];
  v_terms text[][] := array[
    ['b346 C1: the v_claimed ownership flag',     '\\mv_claimed\\M'],
    ['b346 C3: the slot comparison',              '\\mv_prev_slot\\M'],
    ['S5: the accrued_to stamp on equip/activity','accrued_to\\s+:?= v_accrued'],
    ['Security ruling: the 12M XP clamp',         'c_max_xp_delta\\s+constant bigint\\s*:=\\s*12000000'],
    ['b348: the tool_carry delta key',            '\\mtool_carry\\M'],
    ['C5/X3: the daily budget is enforced',       'hr_day_budget_check'],
    ['b351: the gem daily dimension',             '\\mv_gems_in\\M'],
    ['S5: the gem per-call clamp',                'c_max_gem_delta']
  ];
begin
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply missing — apply 2026-08-11-apply-engine.sql first';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of missing — apply 2026-08-11-apply-engine.sql first';
  end if;
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';
  foreach v_term slice 1 in array v_terms loop
    if v_src !~ v_term[2] then
      raise exception 'REFUSING TO INSTALL: the live hr_apply does not contain "%" (/%/), so it is '
                      'NOT the body this file was derived from. Replacing it would delete that '
                      'change. Re-derive with tools/derive-fight-carry.mjs against whatever is '
                      'actually live.', v_term[1], v_term[2];
    end if;
  end loop;

  -- THE CEILING MUST EXIST BEFORE THE CLAMP THAT READS IT. Without max_hp the
  -- fight validation at (4a-iii) would refuse EVERY fight as unknown_monster —
  -- fail-closed, but it would 409 every combat window on the day it deployed.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_activities'
                    and column_name = 'max_hp') then
    raise exception 'hr_activities.max_hp is missing — re-apply '
                    '2026-08-11-catalogue.generated.sql (regenerate it with '
                    'node tools/gen-catalogues.mjs) before this file';
  end if;
  if not exists (select 1 from public.hr_activities where kind = 'combat' and max_hp > 0) then
    raise exception 'no combat activity carries a max_hp — the carried-fight clamp would refuse '
                    'every fight. Re-apply 2026-08-11-catalogue.generated.sql';
  end if;
end $$;

-- ── 1. THE COLUMN ────────────────────────────────────────────────────────
-- jsonb rather than three columns — see the header. NOT NULL DEFAULT '{}' so
-- \`st.fight ?? null\` in the Edge Function can never see a null on a database
-- that HAS the column: the null is reserved to mean "no column", and a nullable
-- column would make the self-configuring switch ambiguous.
alter table public.player_state
  add column if not exists fight jsonb not null default '{}'::jsonb;

-- The CONTAINER is a database fact, not only an engine promise. hr_apply
-- validates the contents; this stops any future writer putting an array or a
-- scalar here.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_state'::regclass
                    and conname = 'player_state_fight_object') then
    alter table public.player_state
      add constraint player_state_fight_object
      check (jsonb_typeof(fight) = 'object');
  end if;
end $$;

-- ── 2. hr_state_of — the envelope grows by ONE key ───────────────────────
-- REPLACED VERBATIM from 2026-08-15-tool-carry.sql §2 with \`fight\` added to
-- \`state\`. Everything else — including the VOLATILE marker, which
-- apply-engine §6(f) asserts and which a \`create or replace\` would silently
-- drop if it were omitted — is unchanged. §6 re-asserts the full key list.
${state}
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 3. hr_apply — the whole body, restated with FIVE patched anchors ─────
-- Patches, in order of appearance:
--   (1) declare  c_delta_keys gains 'fight'   [the ONE declared removal]
--   (2) declare  v_fight, v_fight_max, c_max_fight_kills
--   (3) step (4a-iii) validates the fight and RE-CLAMPS hp against
--       hr_activities.max_hp, inside the protected block
--   (4) the player_state UPDATE writes it, with the activity arm FIRST
--   (5) the post-state VOID, read off the row rather than off the delta
-- Everything else is verbatim.
${apply}

-- ── 4. GRANTS ON hr_apply — revoke from PUBLIC first, then grant ─────────
-- A privileged RPC left executable by authenticated/anon is the whole game.
-- \`create or replace\` does NOT reset an ACL, so these are restated rather than
-- assumed, and §6 asserts the result rather than trusting these three lines.
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 5. NO CLIENT WRITE ON THE NEW COLUMN ────────────────────────────────
-- player_state's grants are column-agnostic, so a new column inherits whatever
-- the table has. Asserted in §6 rather than restated here, because a REVOKE
-- that is not checked is a REVOKE nobody knows the effect of.

-- ── 6. SELF-VERIFICATION — the commit gate ──────────────────────────────
do $$
declare v_src text; v_bad text; v_n int; v_missing text;
begin
  -- (a) THE COLUMN LANDED, with the shape the switch depends on.
  select is_nullable || '/' || coalesce(column_default, 'NO DEFAULT')
    into v_missing
    from information_schema.columns
   where table_schema = 'public' and table_name = 'player_state' and column_name = 'fight';
  if v_missing is null then raise exception 'player_state.fight did not land'; end if;
  if v_missing not like 'NO/%' then
    raise exception 'player_state.fight is NULLABLE (%). The null is reserved to mean "this database '
                    'has no column"; a nullable column makes the engine''s self-configuring switch '
                    'ambiguous and it would stop writing the key.', v_missing;
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_state'::regclass
                    and conname = 'player_state_fight_object') then
    raise exception 'the player_state_fight_object CHECK did not land';
  end if;

  -- (b) THE BODY THAT LANDED CARRIES EVERYTHING §0 REFUSED TO DESTROY, plus
  --     this file's own change. §0 checked before the replace; this checks
  --     after, which is what makes the pair a gate.
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';
  foreach v_bad in array array[
    'v_gems_in', 'gems_in', 'v_prev_slot', 'intent_mismatch', 'tool_carry',
    'hr_day_budget_check', 'c_max_xp_delta     constant bigint := 12000000',
    -- ...and this file's five anchors, so a derivation that silently produced
    -- the OLD body under a new filename fails here instead of shipping.
    'v_fight', 'c_max_fight_kills', 'bad_fight_hp', 'hr_activities',
    'when p_delta ? ''activity'' then ''{}''::jsonb',
    -- Security F2: the PRESENCE test. Without it jsonb_typeof of an absent key
    -- is NULL, the whole type disjunction is NULL, and the ceiling check is
    -- skipped for a checkpoint that simply omitted its hp.
    'v_fight ? ''monster'' and v_fight ? ''hp'' and v_fight ? ''kills''',
    -- Security F3: the intent-key release class. Without it a bad_fight_hp
    -- rejection bricks a derived key for up to 25 hours.
    'c_release_codes', 'any (c_release_codes)']
  loop
    if position(v_bad in v_src) = 0 then
      raise exception 'the hr_apply that landed does not contain "%" — the restatement in §3 is wrong',
        v_bad;
    end if;
  end loop;

  -- (c) hr_state_of still projects EVERY key, and gained one. A shortened
  --     envelope is a client that silently loses a field.
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';
  foreach v_bad in array array[
    'gold', 'gems', 'hearth_tokens', 'bank_cap', 'active_kind', 'active_id',
    'active_since', 'accrued_to', 'auto_eat_enabled', 'auto_eat_food', 'auto_eat_pct',
    'tool_carry', 'fight', 'progress_truncated', 'total_level']
  loop
    if position(v_bad in v_src) = 0 then
      raise exception 'the hr_state_of that landed does not project "%" — the restatement in §2 '
                      'shortened the client''s world', v_bad;
    end if;
  end loop;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'hr_state_of' and p.provolatile = 'v') then
    raise exception 'hr_state_of is no longer VOLATILE — the restatement dropped the marker and it '
                    'would be folded';
  end if;

  -- (d) NEITHER PRIVILEGED RPC IS CLIENT-EXECUTABLE. The load-bearing one.
  for v_bad in select unnest(array['hr_apply(uuid,integer,bigint,uuid,jsonb)',
                                   'hr_state_of(uuid,integer)']) loop
    for v_missing in select unnest(array['anon','authenticated','service_role','public']) loop
      if has_function_privilege(v_missing, 'public.' || v_bad, 'execute') then
        raise exception '% is EXECUTABLE by % — that is the whole game', v_bad, v_missing;
      end if;
    end loop;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute') then
    raise exception 'hr_engine cannot execute hr_apply — every intent would 500';
  end if;

  -- (e) NO CLIENT WRITE POLICY OR GRANT ON player_state. The new column
  --     inherits the table's grants, so this is about the column too.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'player_state'
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_n > 0 then
    raise exception '% client write policies on player_state — a client could write its own fight '
                    'state, which is the entire mint this file exists to prevent', v_n;
  end if;
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'player_state'
     and grantee in ('anon','authenticated','PUBLIC')
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v_n > 0 then
    raise exception '% client write grants on player_state', v_n;
  end if;

  -- (f) THE CEILING IS REAL AND THE CLAMP IS NOT VACUOUS. A positive control:
  --     the clamp reads hr_activities.max_hp, so a null ceiling would make it
  --     admit nothing (fail-closed) — but a ceiling that is null for the
  --     monsters players actually fight is a 409 machine, and one that is
  --     absurdly large is no clamp at all.
  select count(*) into v_n from public.hr_activities where kind = 'combat' and max_hp is null;
  if v_n > 0 then
    raise exception '% combat activities have no max_hp — every fight against them would be '
                    'refused unknown_monster', v_n;
  end if;
  select count(*) into v_n from public.hr_activities where kind <> 'combat' and max_hp is not null;
  if v_n > 0 then
    raise exception '% non-combat activities carry a max_hp — a carried fight could name a tree', v_n;
  end if;

  raise notice 'FIGHT CARRY OK — player_state.fight installed, hr_apply re-clamps against % combat '
               'ceilings (max %), neither RPC client-executable',
    (select count(*) from public.hr_activities where kind = 'combat'),
    (select max(max_hp) from public.hr_activities where kind = 'combat');
end $$;
`;
}

const SELF = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const [apply, state] = await Promise.all([deriveApply(), deriveStateOf()]);
  if (process.argv.includes('--write')) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(MIG, TARGET), migration(state, apply), 'utf8');
    console.log(`wrote supabase/migrations/${TARGET}`);
  } else if (process.argv.includes('--check')) {
    const mig = (await readFile(join(MIG, TARGET), 'utf8')).replace(/\r\n/g, '\n');
    let bad = 0;
    for (const [name, body] of [['hr_apply', apply], ['hr_state_of', state]]) {
      if (!mig.includes(body)) {
        console.error(`DRIFT: ${TARGET}'s ${name} is not what this script derives from `
          + `${name === 'hr_apply' ? APPLY_SRC : STATE_SRC}. Regenerate it — do not hand-edit `
          + 'a restated body.');
        bad++;
      }
    }
    if (bad) process.exit(1);
    console.log(`derive-fight-carry: ${TARGET} matches the derivation (hr_apply ${apply.length} B, `
      + `hr_state_of ${state.length} B)`);
  } else {
    console.log(state);
    console.log('\n\n');
    console.log(apply);
  }
}
