// ============================================================================
// tools/derive-enchant.mjs — BUILD 2026-08-18-enchant.sql (ELEMENTS/ENCHANTING
// v1) by EXTRACTING the CURRENT live bodies and patching them at named anchors.
// Nothing is retyped.
//
//   node tools/derive-enchant.mjs          # print the derived bodies
//   node tools/derive-enchant.mjs --write  # (re)write the migration
//   node tools/derive-enchant.mjs --check  # assert the migration still contains
//                                          # what this derives
//
// WHY THIS EXISTS — read tools/derive-skill-row-upsert.mjs's header first.
// `create or replace` on a ~70 KB hr_apply body you have not read silently
// deletes whichever of the ownership flag / tool_carry key / accrued_to stamp /
// 12M XP clamp / daily budget / Phase 0 fight block / equip release codes /
// skill-row upsert the typist did not know about. This script produces a body
// that passes tests/run-sql-tests.mjs line by line, plus the ONE new thing.
//
// SOURCES — THE CURRENT LAST TOUCHERS:
//   hr_apply    <- 2026-08-18-skill-row-upsert.sql   (last toucher of hr_apply)
//   hr_state_of <- 2026-08-17-fight-carry.sql        (last toucher of hr_state_of)
//
// ── WHAT IT SHIPS (ELEMENTS v1) ─────────────────────────────────────────────
// The `enchant` intent (supabase/functions/hr-accrue/enchant.js) is a clone of
// `equip`. Its authority is hr_apply, and hr_apply needs to (1) understand an
// `enchant` delta key, (2) resolve the rune it carries to an ELEMENT via the
// hr_runes catalogue and set the server-owned player_state.enchant, and (3)
// stamp accrued_to so the collect-before-enchant order is closed structurally.
//
//   §1a  player_state.enchant jsonb   — server-owned state, added additively.
//   §1b  hr_state_of                  — returns `enchant` top-level (next to
//                                       `equipment`), so the client renders it
//                                       and the accrual shell builds `eq` from
//                                       equipment + this (accrual.js weakness()).
//   §1c  hr_apply                     — six patches:
//        · 'enchant' on c_delta_keys                (else unknown_delta_key)
//        · v_enchant_el declaration
//        · the ENCHANT BLOCK (resolve rune→element, weapon-holds-weapon gate,
//          debit the rune = ownership check, set enchant state) — a TRANSFER
//          mirroring the equip block, inside the protected block
//        · 'enchant' on the §S5 stamping condition (closes the window)
//        · 'enchant' on c_ledger_kinds              (journal kind:'enchant')
//        · 'bad_enchant' on c_release_codes         (shape refusal, like bad_equip)
//   §2   grants        — revoke from public/anon/authenticated first, then engine
//   §3   self-verify   — the commit gate
//
// ⚠ THIS FILE BECOMES THE LAST TOUCHER OF BOTH hr_apply AND hr_state_of. A later
//   file replacing either would silently delete this change; that ordering lives
//   in tests/schema-apply-order.json.
// ============================================================================
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'supabase', 'migrations');

const APPLY_SRC = '2026-08-18-skill-row-upsert.sql';
const STATE_SRC = '2026-08-17-fight-carry.sql';
const TARGET = '2026-08-18-enchant.sql';

async function fnText(file, open) {
  const sql = (await readFile(join(MIG, file), 'utf8')).replace(/\r\n/g, '\n');
  const i = sql.indexOf(open);
  if (i < 0) throw new Error(`${file}: cannot find ${open}`);
  const j = sql.indexOf('\nend $$;\n', i);
  if (j < 0) throw new Error(`${file}: cannot find the end of ${open}`);
  return sql.slice(i, j + '\nend $$;'.length);
}

/* Every patch must match EXACTLY ONCE — see derive-fight-carry.mjs for the
   argument. A patch that matches twice edits a line somebody else's fix depends
   on; a patch that matches zero times means the anchor moved and the derivation
   silently produced the OLD body under a new filename. */
function patch(text, anchor, replacement, label) {
  const n = text.split(anchor).length - 1;
  if (n !== 1) throw new Error(`anchor "${label}" matched ${n} times, must match exactly 1`);
  return text.replace(anchor, replacement);
}

// ── THE ENCHANT BLOCK — a TRANSFER, mirroring the equip block above it ──────
const ENCHANT_BLOCK = `    -- ── ENCHANTING (ELEMENTS v1) ─────────────────────────────────────────
    -- Applying a rune to the weapon MIRRORS the equip TRANSFER above: one rune
    -- leaves player_inventory (the debit IS the ownership check) and the
    -- server-owned player_state.enchant[<slot>] becomes the rune's ELEMENT,
    -- RESOLVED from the SERVER catalogue hr_runes — never an element the Edge
    -- Function proposed. Re-validated here under the row lock; the Edge answer is
    -- only an earlier, named refusal. v1 enchants the WEAPON slot only, and only
    -- when it currently holds a weapon.
    --   • the enchant slot is a real equip slot and is the weapon slot (v1)
    --   • the rune resolves to an element              (hr_runes)
    --   • that slot currently holds a WEAPON           (player_equipment + hr_items.kind)
    --   • the player owns >=1 of the rune — the debit is the check
    if p_delta ? 'enchant' then
      if jsonb_typeof(p_delta->'enchant') <> 'object' then perform public.hr_reject('bad_enchant'); end if;
      -- v1 is ONE slot per call; more than one is a shape error, not a partial
      -- apply. (equip allows a loadout map; an enchant is a single gesture.)
      if (select count(*) from jsonb_object_keys(p_delta->'enchant')) <> 1 then
        perform public.hr_reject('bad_enchant', jsonb_build_object('why', 'one slot per enchant'));
      end if;
      for k, v_eq in select key, value from jsonb_each(p_delta->'enchant') loop
        if not exists (select 1 from public.hr_equip_slots where equip_slot = k) then
          perform public.hr_reject('unknown_equip_slot', jsonb_build_object('equip_slot', k));
        end if;
        -- v1: WEAPON ONLY. A real slot that is not the weapon slot is wrong_slot,
        -- the same code a slot that holds no weapon gets below — "this cannot be
        -- enchanted" is one fact.
        if k <> 'weapon' then
          perform public.hr_reject('wrong_slot', jsonb_build_object('equip_slot', k));
        end if;
        if jsonb_typeof(v_eq) <> 'string' then
          perform public.hr_reject('bad_enchant', jsonb_build_object('equip_slot', k));
        end if;
        v_item := v_eq #>> '{}';                       -- the RUNE id
        -- RESOLVE rune -> element from the catalogue. Unknown => not a rune.
        select element into v_enchant_el from public.hr_runes where rune_id = v_item;
        if v_enchant_el is null then
          perform public.hr_reject('unknown_item', jsonb_build_object('item_id', v_item));
        end if;
        -- The target slot must currently hold a WEAPON. The server reads its OWN
        -- equipment, never the client's claim.
        select item_id into v_cur from public.player_equipment
         where user_id = v_uid and slot = v_slot and equip_slot = k for update;
        if v_cur is null
           or not exists (select 1 from public.hr_items where item_id = v_cur and kind = 'weapon') then
          perform public.hr_reject('wrong_slot', jsonb_build_object('equip_slot', k, 'held', v_cur));
        end if;
        -- DEBIT one rune. This is the ownership check; there is nothing else to
        -- check, exactly as with the equip debit above. insufficient_item is
        -- DELIBERATELY off c_release_codes for the same reason equip's is.
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
        -- SET the server-owned enchant state to the resolved ELEMENT. jsonb
        -- merge so any future ELEMENTS v2 slot survives a single-slot enchant.
        update public.player_state
           set enchant = coalesce(enchant, '{}'::jsonb) || jsonb_build_object(k, v_enchant_el)
         where user_id = v_uid and slot = v_slot;
      end loop;
    end if;

`;

export async function deriveApply() {
  let t = await fnText(APPLY_SRC, 'create or replace function public.hr_apply(');

  // (1) 'enchant' on the delta-key allowlist.
  t = patch(t, `    'fight'];`,
    `    'fight',
    -- ELEMENTS/ENCHANTING v1: the server-owned weapon enchant. hr_apply resolves
    -- the rune it carries to an ELEMENT via hr_runes and stores THAT.
    'enchant'];`,
    "'enchant' on c_delta_keys");

  // (2) the element scratch variable.
  t = patch(t, `  v_eq    jsonb; v_item text; v_cur text;`,
    `  v_eq    jsonb; v_item text; v_cur text;
  v_enchant_el text;   -- ELEMENTS v1: the element hr_runes resolves a rune to`,
    'v_enchant_el declaration');

  // (3) the ENCHANT BLOCK, injected before BANK CAP (still inside the protected
  //     block, so a refusal rolls it back whole).
  t = patch(t, `    -- ── BANK CAP ─ counted once, AFTER items and equipment, because both can`,
    ENCHANT_BLOCK + `    -- ── BANK CAP ─ counted once, AFTER items and equipment, because both can`,
    'the enchant block before BANK CAP');

  // (4) 'enchant' closes the accrual window (§S5), exactly like equip/activity.
  t = patch(t, `    if p_delta ? 'equip' or p_delta ? 'activity' then`,
    `    if p_delta ? 'equip' or p_delta ? 'activity' or p_delta ? 'enchant' then`,
    "'enchant' on the §S5 stamping condition");

  // (5) 'enchant' is a real ledger kind (journal.kind:'enchant').
  t = patch(t, `    'quest','equip','admin','iap','clan','raid'];`,
    `    'quest','equip','admin','iap','clan','raid','enchant'];`,
    "'enchant' on c_ledger_kinds");

  // (6) 'bad_enchant' releases its intent key — a SHAPE refusal, exactly like
  //     'bad_equip'. insufficient_item stays OFF the list (ownership check).
  t = patch(t, `    'too_many_equip_ops'];`,
    `    'too_many_equip_ops', 'bad_enchant'];`,
    "'bad_enchant' on c_release_codes");

  return t;
}

export async function deriveStateOf() {
  let t = await fnText(STATE_SRC, 'create or replace function public.hr_state_of(');

  t = patch(t, `    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)
        from public.player_equipment where user_id = p_user and slot = v_st.slot), '{}'::jsonb),`,
    `    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)
        from public.player_equipment where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    -- ELEMENTS/ENCHANTING v1: the server-owned weapon enchant,
    -- \`{ <equip_slot>: <element> }\`. Read here so the client renders it and the
    -- accrual shell builds \`eq\` from equipment + this (accrual.js weakness()),
    -- never from a client value. \`{}\` when nothing is enchanted.
    'enchant', coalesce(v_st.enchant, '{}'::jsonb),`,
    "'enchant' in the hr_state_of envelope");

  return t;
}

function migration(apply, stateOf) {
  return `-- ============================================================================
-- 2026-08-18-enchant.sql — ELEMENTS/ENCHANTING v1: the server half.
--
-- Governing rule: CLAUDE.md "Server authority (locked 2026-08-10)". A rune is
-- applied to the weapon by the \`enchant\` intent
-- (supabase/functions/hr-accrue/enchant.js), a CLONE of \`equip\`. The client
-- sends a slot NAME and a rune item NAME; hr_apply resolves the rune to an
-- ELEMENT via the hr_runes catalogue under the character lock, checks the weapon
-- slot holds a weapon, DEBITS the rune (the ownership check) and sets the
-- server-owned player_state.enchant. No element, magnitude or success bit ever
-- crosses from the client.
--
-- ⚠ GENERATED. The restated hr_apply / hr_state_of below are produced by
--   \`node tools/derive-enchant.mjs --write\` from the CURRENT last touchers
--   (hr_apply <- 2026-08-18-skill-row-upsert.sql; hr_state_of <-
--   2026-08-17-fight-carry.sql) and patched at named anchors. Do NOT hand-edit;
--   \`--check\` runs in the suite and will fail. Retyping either body is how a
--   load-bearing invariant silently disappears.
--
-- ── APPLY ORDER ─────────────────────────────────────────────────────────────
--   ... -> 2026-08-11-catalogue.generated.sql (creates + seeds hr_runes)
--       -> 2026-08-17-fight-carry.sql (hr_state_of predecessor)
--       -> 2026-08-18-skill-row-upsert.sql (hr_apply predecessor)
--       -> THIS FILE
--   §0 fails closed if hr_runes is absent or if the live bodies are not the ones
--   this file was derived from.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Additive. player_state.enchant is added with a default of NULL (read as \`{}\`);
-- no existing row is touched. Every delta the previous hr_apply accepted is
-- still accepted identically — the only new outcomes are for deltas that carry
-- the new \`enchant\` key, which nothing produced before. Reverting means
-- re-applying 2026-08-18-skill-row-upsert.sql (restores hr_apply) and
-- 2026-08-17-fight-carry.sql (restores hr_state_of); the column may be left in
-- place harmlessly. The Edge payload's enchant verb no-ops against a database
-- without this file only in that hr_apply answers unknown_delta_key — SAFE with
-- a staged deploy (apply this file, then deploy).
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

  -- The hr_runes catalogue MUST exist (2026-08-11-catalogue.generated.sql). The
  -- enchant block resolves against it; an absent table would make every enchant
  -- a hard 42P01 rather than a named refusal.
  if to_regclass('public.hr_runes') is null then
    raise exception 'hr_runes is absent — apply 2026-08-11-catalogue.generated.sql (regenerated with '
                    'node tools/gen-catalogues.mjs) before this file';
  end if;

  -- The hr_apply body we are about to REPLACE must be the skill-row-upsert one.
  foreach v_need in array array[
    'on conflict (user_id, slot, skill_id)',   -- skill-row-upsert's own change
    'c_release_codes', 'v_fight', 'tool_carry', 'hr_day_budget_check',
    '''bad_equip'', ''unknown_equip_slot'', ''wrong_slot'', ''requirement_not_met'',']
  loop
    if position(v_need in v_apply) = 0 then
      raise exception 'the LIVE hr_apply does not contain "%" — it is not the body this file was '
                      'derived from (2026-08-18-skill-row-upsert.sql). Apply that chain first.', v_need;
    end if;
  end loop;

  -- The hr_state_of body we are about to REPLACE must be the fight-carry one.
  if position('''fight'', v_st.fight' in v_state) = 0 then
    raise exception 'the LIVE hr_state_of does not carry the Phase-0 fight field — it is not the '
                    'body this file was derived from (2026-08-17-fight-carry.sql). Apply it first.';
  end if;

  -- Idempotence note.
  if position('p_delta ? ''enchant''' in v_apply) > 0 then
    raise notice 'the enchant block is already present — this apply is a no-op replace';
  end if;
end $$;

-- ── 1a. THE SERVER-OWNED ENCHANT STATE ───────────────────────────────────
-- jsonb, additive, NULL default (read as {} everywhere). Written ONLY by
-- hr_apply's enchant block; there is no client write policy or grant on
-- player_state (asserted in §3), so this is authoritative.
alter table public.player_state
  add column if not exists enchant jsonb;

-- ── 1a-ii. THE LEDGER KIND ───────────────────────────────────────────────
-- journal.kind:'enchant' must be a legal player_ledger.kind, or hr_apply's
-- ledger insert violates player_ledger_kind_check and the WHOLE enchant comes
-- back as bad_delta (23514). The table constraint mirrors hr_apply's
-- c_ledger_kinds; both gain 'enchant'. Idempotent: drop-if-exists then add.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'player_ledger_kind_check'
              and conrelid = 'public.player_ledger'::regclass) then
    alter table public.player_ledger drop constraint player_ledger_kind_check;
  end if;
  alter table public.player_ledger add constraint player_ledger_kind_check
    check (kind in ('accrue','craft','gather','combat','farm','trade','shop',
                    'quest','equip','admin','iap','clan','raid','enchant'));
end $$;

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
declare v_apply text; v_state text; v_bad text; v_missing text; v_n int; v_block text;
begin
  select prosrc into v_apply from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';
  select prosrc into v_state from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';

  -- (a) THE hr_apply THAT LANDED CARRIES EVERYTHING §0 REFUSED TO DESTROY, plus
  --     this file's own change.
  foreach v_bad in array array[
    'on conflict (user_id, slot, skill_id)', 'c_release_codes', 'v_fight',
    'tool_carry', 'hr_day_budget_check', 'c_max_xp_delta',
    'c_max_equip_kinds', 'player_equipment',
    -- this file's change:
    '''enchant''', 'p_delta ? ''enchant''', 'public.hr_runes', 'v_enchant_el',
    'perform public.hr_reject(''bad_enchant'')']
  loop
    if position(v_bad in v_apply) = 0 then
      raise exception 'the hr_apply that landed does not contain "%" — the restatement in §1c is wrong', v_bad;
    end if;
  end loop;

  -- (b) THE ENCHANT BLOCK IS A TRANSFER: it DEBITS the rune and it STAMPS. Read
  --     out of the block, not substring-matched over the whole body.
  v_n := position('if p_delta ? ''enchant'' then' in v_apply);
  if v_n = 0 then raise exception 'could not locate the enchant block in hr_apply'; end if;
  v_block := substr(v_apply, v_n);
  v_block := substr(v_block, 1, position('-- ── BANK CAP' in v_block));
  if length(v_block) < 200 then raise exception 'the enchant block could not be delimited'; end if;
  foreach v_bad in array array[
    'select element into v_enchant_el from public.hr_runes where rune_id = v_item',
    'and kind = ''weapon''',                                   -- the weapon gate
    'perform public.hr_reject(''insufficient_item''',          -- the ownership debit
    'update public.player_inventory set qty = qty - 1',        -- the debit
    'set enchant = coalesce(enchant, ''{}''::jsonb)']          -- the state set
  loop
    if position(v_bad in v_block) = 0 then
      raise exception 'the enchant block does not contain "%" — the patch in §1c did not land as declared', v_bad;
    end if;
  end loop;
  -- The rune resolution must PRECEDE the debit: never debit for a non-rune.
  if position('select element into v_enchant_el' in v_block)
     > position('update public.player_inventory set qty = qty - 1' in v_block) then
    raise exception 'the rune is debited BEFORE it is resolved against hr_runes — a non-rune would be '
                    'consumed and only then refused';
  end if;

  -- (c) THE WINDOW CLOSES ON enchant (§S5). Without this the collect-before-
  --     enchant order is decorative and "fight cheap, enchant, settle" is open.
  if position('if p_delta ? ''equip'' or p_delta ? ''activity'' or p_delta ? ''enchant'' then' in v_apply) = 0 then
    raise exception 'an enchant delta does not stamp accrued_to — the collect-before-enchant order '
                    'would be unenforced';
  end if;

  -- (d) 'enchant' IS A REAL LEDGER KIND (else journal.kind:'enchant' silently
  --     becomes 'admin').
  if position('''quest'',''equip'',''admin'',''iap'',''clan'',''raid'',''enchant''' in v_apply) = 0 then
    raise exception 'enchant is not on c_ledger_kinds — the journal would file it as admin';
  end if;

  -- (e) 'bad_enchant' RELEASES ITS KEY (shape refusal), 'insufficient_item' does
  --     NOT (ownership check, the dupe-retry loop).
  v_n := position('c_release_codes constant text[] := array[' in v_apply);
  v_block := substr(v_apply, v_n);
  v_block := substr(v_block, 1, position('];' in v_block) + 1);
  if position('''bad_enchant''' in v_block) = 0 then
    raise exception 'bad_enchant is not on c_release_codes — a client shape bug would brick the key';
  end if;
  if position('''insufficient_item''' in v_block) > 0 then
    raise exception 'insufficient_item is on c_release_codes — releasing it hands an unlimited free '
                    'retry loop against a moving inventory (the dupe wants exactly this)';
  end if;

  -- (f) hr_state_of RETURNS 'enchant'.
  if position('''enchant'', coalesce(v_st.enchant' in v_state) = 0 then
    raise exception 'hr_state_of does not return the enchant field — the client and the accrual '
                    'shell could not read the server-owned enchant';
  end if;

  -- (g2) THE LEDGER CONSTRAINT ADMITS 'enchant' (else the ledger insert 23514s
  --      and every enchant is bad_delta).
  if position('''enchant''' in pg_get_constraintdef(
        (select oid from pg_constraint where conname = 'player_ledger_kind_check'
          and conrelid = 'public.player_ledger'::regclass))) = 0 then
    raise exception 'player_ledger_kind_check does not admit enchant — journal.kind:enchant would 23514';
  end if;

  -- (g) THE COLUMN EXISTS AND IS jsonb.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'player_state'
     and column_name = 'enchant' and data_type = 'jsonb';
  if v_n <> 1 then raise exception 'player_state.enchant is missing or not jsonb'; end if;

  -- (h) NEITHER PRIVILEGED RPC IS CLIENT-EXECUTABLE.
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

  -- (i) NO CLIENT WRITE POLICY OR GRANT ON player_state. The enchant column is
  --     written only by hr_apply; a client that could write player_state could
  --     author its own enchant.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'player_state'
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_n > 0 then raise exception '% client write policies on player_state', v_n; end if;
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'player_state'
     and grantee in ('anon','authenticated','PUBLIC')
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v_n > 0 then raise exception '% client write grants on player_state', v_n; end if;

  raise notice 'ENCHANT OK — % runes in the catalogue, enchant delta key + block live, window '
               'closes on enchant, journal kind enchant, bad_enchant releases, hr_apply not '
               'client-executable', (select count(*) from public.hr_runes);
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
      console.error(`DRIFT: ${TARGET}'s hr_apply is not what this script derives from ${APPLY_SRC}.`);
      process.exit(1);
    }
    if (!mig.includes(stateOf)) {
      console.error(`DRIFT: ${TARGET}'s hr_state_of is not what this script derives from ${STATE_SRC}.`);
      process.exit(1);
    }
    console.log(`derive-enchant: ${TARGET} matches (hr_apply ${apply.length} B, hr_state_of ${stateOf.length} B)`);
  } else {
    console.log(apply);
    console.log('\n\n-- ===== hr_state_of =====\n');
    console.log(stateOf);
  }
}
