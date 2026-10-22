#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-companion-unlocks.mjs — GOLD-SPEND SLICE 4 (COMPANION UNLOCKS),
// generated from src/data/companion-unlocks.js with (1) a drift guard against
// src/data/companions.js and (2) a BODY DERIVATION of hr_unlock_buy extracted
// from 2026-08-16-unlock-buy.sql and patched at two named anchors. Nothing is
// retyped.
//
//   node tools/gen-companion-unlocks.mjs           → (re)write the migration
//   node tools/gen-companion-unlocks.mjs --check   → exit 1 if committed differs
//   node tools/gen-companion-unlocks.mjs --report  → print the extraction
//
// ── WHAT IT EMITS ───────────────────────────────────────────────────────
// supabase/migrations/2026-08-19-companion-unlocks.sql:
//   §1  ALTER hr_unlock_offers ADD req_skill (text) + req_skill_level (int)
//   §2  the DERIVED hr_unlock_buy — unlock-buy.sql's body plus ONE skill gate
//       after the property-tier check (ordered after rung-order, like the tier
//       gate) and ONE declaration (v_lvl)
//   §3  grants (revoke public/anon/authenticated/service_role, grant hr_engine)
//   §4  the companion single-rung max ladders + their offers (price + gates)
//   §5  structural assertions
//   §6  a behavioural probe that drives the REAL hr_unlock_buy
//
// ── WHY DERIVE hr_unlock_buy RATHER THAN RETYPE IT ──────────────────────
// `create or replace` on a ~400-line SECURITY DEFINER body you have not read is
// the most destructive statement in this repo: the advisory lock, the
// idempotency rules, the per-day clamp, the GREATEST-merge and the rung ladder
// all live in that body, and a typo silently deletes one. So the body is
// EXTRACTED from the current owner (2026-08-16-unlock-buy.sql) and patched at
// two anchors that must each match exactly once. `--check` runs in the smoke
// suite; a hand-edit or a moved anchor fails it.
//
// PURE ESM, Node only. Writes one file.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMPANIONS } from '../src/data/companions.js';
import { COMPANION_OFFERS, COMPANION_UNLOCKS, COMPANION_OFFER_IDS } from '../src/data/companion-unlocks.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'supabase', 'migrations');
const SRC = '2026-08-16-unlock-buy.sql';
const OUT = join(MIG, '2026-08-19-companion-unlocks.sql');

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const REPORT = argv.includes('--report');

const die = (m) => { console.error(`gen-companion-unlocks: ${m}`); process.exit(1); };

// ── DRIFT GUARD — the manifest must equal what companions.js says today ─────
// COMPANION_OFFERS is derived from COMPANIONS in the manifest, so a mismatch
// here means the manifest's own derivation changed shape. We RE-DERIVE the
// expected shop set independently and require the offers to match one-for-one,
// so a companion added to companions.js with a shop source that the manifest
// somehow drops (or a price/skill edit) fails the build rather than silently
// selling the old set at the old price.
{
  const expect = Object.keys(COMPANIONS)
    .filter((id) => /^shop:/.test(String(COMPANIONS[id].source || '')))
    .sort((a, b) => a.localeCompare(b));
  const got = COMPANION_OFFERS.map((o) => o.unlock_id.replace(/^companion:/, '')).sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(expect) !== JSON.stringify(got)) {
    die(`companion set DRIFT: companions.js shop companions ${JSON.stringify(expect)} != manifest ${JSON.stringify(got)}`);
  }
  for (const o of COMPANION_OFFERS) {
    const id = o.unlock_id.replace(/^companion:/, '');
    const parts = String(COMPANIONS[id].source).split(':');
    const price = Number.parseInt(parts[1], 10);
    if (o.gold !== price) die(`companion ${id} price DRIFT: manifest ${o.gold} != companions.js ${price}`);
    let skill = null; let lv = null;
    if (parts[2]) { const m = parts[2].match(/^(\w+?)(\d+)$/); if (m) { skill = m[1]; lv = Number.parseInt(m[2], 10); } }
    if (o.req_skill !== skill || o.req_skill_level !== lv) {
      die(`companion ${id} skill-req DRIFT: manifest ${o.req_skill}/${o.req_skill_level} != companions.js ${skill}/${lv}`);
    }
    if (o.value !== 1) die(`companion ${id} is not a single rung`);
  }
}

// ── BODY DERIVATION — extract hr_unlock_buy and patch it ────────────────────
async function fnText(file, open) {
  const sql = (await readFile(join(MIG, file), 'utf8')).replace(/\r\n/g, '\n');
  const i = sql.indexOf(open);
  if (i < 0) die(`${file}: cannot find ${open}`);
  const j = sql.indexOf('\nend $$;\n', i);
  if (j < 0) die(`${file}: cannot find the end of ${open}`);
  return sql.slice(i, j + '\nend $$;'.length);
}

function patch(text, anchor, replacement, label) {
  const n = text.split(anchor).length - 1;
  if (n !== 1) die(`anchor "${label}" matched ${n} times, must match exactly 1`);
  return text.replace(anchor, replacement);
}

const SKILL_GATE = `      if v_tier < v_off.req_property_tier then
        perform public.hr_reject('prereq_property_tier',
          jsonb_build_object('have', v_tier, 'need', v_off.req_property_tier,
                             'offer', v_off.offer_id));
      end if;
    end if;

    -- ⚠ THE SKILL PREREQUISITE (companion unlocks, slice 4, 2026-08-19).
    --   The FIRST gold spend gated on a SKILL LEVEL. It mirrors the property-
    --   tier gate directly above and reads the character's OWN server-side level
    --   the EXACT way hr_apply's equip and activity gates do — hr_level_from_xp
    --   over player_skills — never a client value. A missing skill row is level
    --   1 (coalesce), the same default those gates use.
    --
    --   ⚠ ORDERED AFTER RUNG-ORDER (§d), like the tier gate, ON PURPOSE: a
    --     skipped rung must answer 'rung_skipped', not 'prereq_skill_level', so
    --     the ladder failure is diagnosed as a ladder failure. (Companions are
    --     single-rung today, so this ordering is currently only a discipline —
    --     but it is the discipline the tier gate follows and the next multi-rung
    --     skill-gated ladder will depend on it.)
    --
    --   Both columns are NULL for an ungated offer, so the whole block is
    --   skipped and every existing offer is unaffected.
    if v_off.req_skill is not null then
      select public.hr_level_from_xp(s.xp) into v_lvl
        from public.player_skills s
       where s.user_id = v_uid and s.slot = v_slot and s.skill_id = v_off.req_skill;
      if coalesce(v_lvl, 1) < coalesce(v_off.req_skill_level, 0) then
        perform public.hr_reject('prereq_skill_level',
          jsonb_build_object('skill', v_off.req_skill, 'have', coalesce(v_lvl, 1),
                             'need', v_off.req_skill_level, 'offer', v_off.offer_id));
      end if;
    end if;`;

async function deriveBuy() {
  let t = await fnText(SRC, 'create or replace function public.hr_unlock_buy(');
  t = patch(t, '  v_rungs  int[];',
    '  v_rungs  int[];\n  v_lvl    int;', 'the v_lvl declaration');
  t = patch(t,
    `      if v_tier < v_off.req_property_tier then
        perform public.hr_reject('prereq_property_tier',
          jsonb_build_object('have', v_tier, 'need', v_off.req_property_tier,
                             'offer', v_off.offer_id));
      end if;
    end if;`,
    SKILL_GATE, 'the skill gate after the property-tier check');
  return t;
}

// ── EMIT ────────────────────────────────────────────────────────────────────
const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const num = (n) => (n === null || n === undefined ? 'null' : String(n));
const jb = (o) => `${q(JSON.stringify(o))}::jsonb`;
const iarr = (a) => `array[${a.join(',')}]::int[]`;

const DIGEST = createHash('sha256')
  .update(JSON.stringify({ COMPANION_UNLOCKS, COMPANION_OFFERS })).digest('hex');

const unlockLines = COMPANION_UNLOCKS.map((u) =>
  `  (${q(u.unlock_id)}, ${q(u.namespace)}, 'max', 'unlock', ${num(u.max_value)}, ${iarr(u.rungs)})`).join(',\n');

const offerLines = COMPANION_OFFERS.map((r) =>
  `  (${q(r.offer_id)}, ${q(r.table_name)}, ${q(r.name)}, ${q(r.unlock_id)}, ${num(r.value)}, `
  + `${num(r.gold)}, ${jb(r.items)}, ${num(r.req_property_tier)}, null, null, ${q(r.req_skill)}, ${num(r.req_skill_level)})`).join(',\n');

const offerIds = COMPANION_OFFER_IDS.map((id) => q(id)).join(', ');
const nSell = COMPANION_OFFERS.length;
const nUnlock = COMPANION_UNLOCKS.length;
const nSkillGated = COMPANION_OFFERS.filter((o) => o.req_skill !== null).length;

// Pick a concrete pair for the behavioural probe by PROPERTY, not by name, so a
// data edit cannot leave the probe testing nothing.
const GATED = COMPANION_OFFERS.find((o) => o.req_skill !== null);
const UNGATED = COMPANION_OFFERS.find((o) => o.req_skill === null);
const GATED2 = COMPANION_OFFERS.filter((o) => o.req_skill !== null && o.req_skill !== (GATED && GATED.req_skill))[0];
if (!GATED || !UNGATED) die('the probe needs one skill-gated and one ungated companion; the data no longer provides both');

async function build() {
  const buy = await deriveBuy();
  const g2 = GATED2
    ? `
    -- (h) A SECOND skill-gated companion proves the gate is PER-SKILL: ${GATED2.req_skill}
    --     is still level 1, so ${GATED2.offer_id} is refused even though ${GATED.req_skill} is now high.
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), ${q(GATED2.offer_id)});
    if v_r->>'error' is distinct from 'prereq_skill_level' then
      raise exception 'companion §6(h): ${GATED2.offer_id} at ${GATED2.req_skill} level 1 answered % '
                      '(expected prereq_skill_level — the gate must be per-skill)', v_r;
    end if;
    -- …and LANDS once its own skill reaches ${GATED2.req_skill_level}.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, 0, ${q(GATED2.req_skill)}, public.hr_xp_for_level(${GATED2.req_skill_level}))
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), ${q(GATED2.offer_id)});
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'companion §6(h) CONTROL FAILED: ${GATED2.offer_id} refused at ${GATED2.req_skill} ${GATED2.req_skill_level} (%)', v_r;
    end if;
`
    : '';

  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — GOLD-SPEND SLICE 4: COMPANION UNLOCKS  (GENERATED — DO NOT EDIT)
--   ${nSell} shop companions (${nSkillGated} skill-gated)  ·  digest ${DIGEST}
--
--   Generated by tools/gen-companion-unlocks.mjs from src/data/companion-unlocks.js
--   (drift-guarded against src/data/companions.js) with hr_unlock_buy DERIVED
--   from 2026-08-16-unlock-buy.sql. Any hand edit is reverted by the next
--   generation and FAILS \`node tools/gen-companion-unlocks.mjs --check\`.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────
-- Arms the shop-purchasable companions as single-rung MAX-MERGE unlock ladders
-- sold by the EXISTING spend RPC public.hr_unlock_buy, and adds the FIRST gold
-- spend gated on a SKILL LEVEL:
--   §1  hr_unlock_offers gains req_skill (text) + req_skill_level (int), nullable.
--   §2  hr_unlock_buy gains ONE gate after the property-tier check: if req_skill
--       is set, read the character's OWN server-side level (hr_level_from_xp over
--       player_skills — the exact read the equip/activity gates use) and refuse
--       'prereq_skill_level' below req_skill_level. A client level never enters.
--   §4  one companion:<id> unlock (rungs=[1]) + its offer per shop companion.
--
-- ── THE NEW INVARIANT, STATED FOR SECURITY ──────────────────────────────
-- A forged client skill level cannot buy a skill-gated companion. The gate reads
-- player_skills, which has NO client write grant and NO client write policy, and
-- derives the level through hr_level_from_xp. The Edge Function forwards only an
-- OFFER ID (companion-catalogue.js); it holds no price and no level. The gate is
-- ordered AFTER rung-order so a skipped rung is still 'rung_skipped'.
--
-- ── WHY SINGLE-RUNG MAX, NOT A COUNT OR FLAG ────────────────────────────
-- Each companion is an INDEPENDENT boolean, so each is its own unlock_id with a
-- one-rung ladder. GREATEST-merge makes a second buy 'already_owned' not a double
-- charge; a replay pays once; the storage guard refuses any value off [1].
--
-- ⚠ APPLY-ORDER / RE-APPLY CONTRACT
--   §2 create-or-replaces hr_unlock_buy, so this file is the LAST toucher of that
--   body — it must apply AFTER 2026-08-16-unlock-buy.sql and
--   2026-08-19-gold-spend-slices-2-3.sql. §0 REFUSES to install unless the live
--   body is unlock-buy.sql's (carries 'prereq_property_tier' + 'unlock_daily_cap')
--   so it can never silently move the body backwards. The offer rows are a scoped
--   delete+insert and the unlock rows an upsert, so re-applying is safe.
--
-- REVERSIBILITY
--   Re-apply 2026-08-16-unlock-buy.sql to restore the pre-skill-gate body, then
--   \`delete from public.hr_unlock_offers where offer_id in (${nSell} ids)\` and
--   \`delete from public.hr_unlocks where unlock_id like 'companion:%'\`. The two
--   columns may be left in place (nullable, unread by any other offer) or dropped.
--
-- SAFE TO RE-RUN.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS + PREDECESSOR GATE — FAIL CLOSED ────────────────────
do $$
declare v_src text; v_len int;
begin
  if to_regclass('public.hr_unlocks') is null or to_regclass('public.hr_unlock_offers') is null then
    raise exception 'the unlock catalogues are absent — apply the 2026-08-16 unlock migrations first';
  end if;
  if to_regclass('public.player_skills') is null then
    raise exception 'player_skills is absent — apply 2026-08-11-player-state.sql first. The skill gate '
                    'reads the character''s OWN level out of it.';
  end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)') is null then
    raise exception 'hr_level_from_xp is absent — apply 2026-08-11-player-state.sql first. The skill '
                    'gate derives the level through it, never from a client value.';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.player_progress'::regclass
                  and tgname = 'player_progress_unlock_guard' and not tgisinternal) then
    raise exception 'player_progress_unlock_guard is absent — apply 2026-08-16-artisan-progress-model.sql '
                    'first. It is the INDEPENDENT storage guard for the companion:<id> rung.';
  end if;

  -- THE PREDECESSOR GATE. §2 REPLACES hr_unlock_buy, so the live body MUST be
  -- 2026-08-16-unlock-buy.sql's — otherwise this replace moves it backwards while
  -- reporting success. Two positive markers + a negative control.
  select prosrc, length(prosrc) into v_src, v_len
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_unlock_buy';
  if v_src is null then
    raise exception 'hr_unlock_buy does not exist — apply 2026-08-16-unlock-buy.sql first. This file '
                    'DERIVES its body from that file and patches in one skill gate.';
  end if;
  if position('prereq_property_tier' in v_src) = 0 or position('unlock_daily_cap' in v_src) = 0 then
    raise exception 'the LIVE hr_unlock_buy (% chars) is not the 2026-08-16-unlock-buy.sql body — it '
                    'lacks the property-tier gate or the per-day clamp this file is derived from. Apply '
                    'that file first; do NOT replace a body you cannot account for.', coalesce(v_len,0);
  end if;
  -- Negative control: a sentinel that appears in no hr_unlock_buy body. If the
  -- scan "sees" it, the scan is blind and the positives above mean nothing.
  if position('hr_slice4_negative_control_not_in_any_body' in v_src) > 0 then
    raise exception 'THE hr_unlock_buy SOURCE SCAN IS BLIND (negative control matched)';
  end if;
  if position('prereq_skill_level' in v_src) > 0 then
    raise notice 'the skill gate is already present — this apply is a no-op replace';
  end if;
end $$;

-- ── 1. THE TWO NEW COLUMNS — nullable, only companion offers use them ─────
alter table public.hr_unlock_offers add column if not exists req_skill       text;
alter table public.hr_unlock_offers add column if not exists req_skill_level  int;

-- ── 2. hr_unlock_buy — DERIVED. Do not hand-edit; see the header. ─────────
${buy}

-- ── 3. GRANTS — revoke from PUBLIC first, then hr_engine ─────────────────
-- The signature is unchanged, so the allowlist entry in hr_assert_grant_hygiene
-- ('hr_unlock_buy(uuid,integer,bigint,uuid,text)') still matches and this file
-- touches neither that function nor the grant-hygiene detector. \`create or
-- replace\` preserves the ACL; these are restated so the postcondition holds on a
-- database where the function was dropped and recreated by hand.
revoke execute on function public.hr_unlock_buy(uuid, int, bigint, uuid, text) from public;
revoke execute on function public.hr_unlock_buy(uuid, int, bigint, uuid, text)
  from anon, authenticated, service_role;
grant execute on function public.hr_unlock_buy(uuid, int, bigint, uuid, text) to hr_engine;

-- ── 4. THE COMPANION LADDERS + OFFERS ────────────────────────────────────
insert into public.hr_unlocks (unlock_id, namespace, merge, progress_kind, max_value, rungs)
values
${unlockLines}
on conflict (unlock_id) do update
  set namespace = excluded.namespace, merge = excluded.merge,
      progress_kind = excluded.progress_kind, max_value = excluded.max_value, rungs = excluded.rungs;

delete from public.hr_unlock_offers where offer_id in (${offerIds});
insert into public.hr_unlock_offers
  (offer_id, table_name, name, unlock_id, value, gold, items, req_property_tier, req_item, refusal,
   req_skill, req_skill_level)
values
${offerLines};

-- ── 5. STRUCTURAL ASSERTIONS ─────────────────────────────────────────────
do $$
declare v_n int; v_bad text; v_p oid;
begin
  -- (a) Every companion offer present and SELLABLE.
  select count(*) into v_n from public.hr_unlock_offers
   where refusal is null and offer_id in (${offerIds});
  if v_n <> ${nSell} then
    raise exception 'expected ${nSell} sellable companion offers, found %', v_n;
  end if;

  -- (b) CROSS-CATALOGUE PARITY — every rung on its own [1] ladder.
  select string_agg(o.offer_id, ', ') into v_bad
    from public.hr_unlock_offers o
    join public.hr_unlocks u on u.unlock_id = o.unlock_id
   where o.offer_id in (${offerIds})
     and (u.merge <> 'max' or u.progress_kind <> 'unlock'
          or not (o.value = any (coalesce(u.rungs, array[]::int[])))
          or (u.max_value is not null and o.value > u.max_value));
  if v_bad is not null then
    raise exception 'companion offers off their own ladder: %', v_bad;
  end if;

  -- (c) THE SKILL GATE IS SANE. A skill-gated offer must name a REAL skill (in
  --     hr_skills) with a positive level, or the gate is either dead (unknown
  --     skill defaults everyone to level 1 and refuses forever) or vacuous.
  select string_agg(offer_id, ', ') into v_bad from public.hr_unlock_offers o
   where o.offer_id in (${offerIds})
     and o.req_skill is not null
     and (o.req_skill_level is null or o.req_skill_level < 1
          or not exists (select 1 from public.hr_skills k where k.skill_id = o.req_skill));
  if v_bad is not null then
    raise exception 'companion offers with an unknown skill or a non-positive level gate: %', v_bad;
  end if;

  -- (d) hr_unlock_buy CARRIES THE NEW GATE and is STILL engine-only.
  v_p := to_regprocedure('public.hr_unlock_buy(uuid,int,bigint,uuid,text)');
  if position('prereq_skill_level' in (select prosrc from pg_proc where oid = v_p)) = 0 then
    raise exception 'hr_unlock_buy does not carry the skill gate — §2 did not land';
  end if;
  foreach v_bad in array array['public','anon','authenticated','service_role'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception 'hr_unlock_buy became executable by % — a client could forge a skill level and '
                      'buy a gated companion for itself with no Edge Function in the way', v_bad;
    end if;
  end loop;
  if not has_function_privilege('hr_engine', v_p, 'execute') then
    raise exception 'hr_unlock_buy is not executable by hr_engine — every companion purchase would 42883';
  end if;

  -- (e) NO CLIENT WRITE SURFACE on the offer table or on player_skills (the gate
  --     reads the latter; a client that could write it could forge its level).
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('hr_unlock_offers','player_skills')
     and grantee in ('anon','authenticated','service_role','PUBLIC')
     and privilege_type <> 'SELECT';
  if v_n > 0 then raise exception '% client write grants on hr_unlock_offers/player_skills', v_n; end if;

  raise notice 'companion §5 PASSED: ${nSell} sellable single-rung offers, ${nSkillGated} skill-gated on a '
               'real skill, hr_unlock_buy carries the gate and is engine-only, no client write surface.';
end $$;

-- ── 6. BEHAVIOUR — the SKILL GATE bites, and a legal buy LANDS ────────────
-- Driven through the REAL hr_unlock_buy so this proves the gate as the engine
-- sells it. Every refusal paired with the nearest legal control. Rolls back with
-- zero residue via the HRB19 subtransaction pattern.
do $$
declare
  v_uid  uuid := '00000000-0000-4000-8000-0000000c04d4'::uuid;
  v_r    jsonb; v_ver bigint; v_g0 bigint; v_g1 bigint; v_key uuid;
begin
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'companion §6 CANNOT RUN: hr_create_character is missing — apply '
                    '2026-08-14-character-bootstrap.sql first. A skipped check is not a passed one.';
  end if;

  begin  -- ── subtransaction, rolled back ────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if coalesce(v_r->>'ok', v_r->>'created', 'false') <> 'true' then
      raise exception 'companion §6: no probe character: %', v_r;
    end if;
    update public.player_state set gold = 10000000 where user_id = v_uid and slot = 0;
    -- Put the gated skill BELOW its requirement.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, 0, ${q(GATED.req_skill)}, public.hr_xp_for_level(${GATED.req_skill_level - 1}))
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;

    -- (a) CONTROL — an UNGATED companion (${UNGATED.offer_id}) sells and charges ${UNGATED.gold}g.
    select version, gold into v_ver, v_g0 from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), ${q(UNGATED.offer_id)});
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'companion §6(a) CONTROL FAILED: ${UNGATED.offer_id} refused (%)', v_r;
    end if;
    select gold into v_g1 from public.player_state where user_id=v_uid and slot=0;
    if v_g1 <> v_g0 - ${UNGATED.gold} then
      raise exception 'companion §6(a): ${UNGATED.offer_id} charged %g, expected ${UNGATED.gold}', v_g0 - v_g1;
    end if;

    -- (b) THE GATE BITES — ${GATED.offer_id} below ${GATED.req_skill} ${GATED.req_skill_level} is refused by NAME.
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), ${q(GATED.offer_id)});
    if v_r->>'error' is distinct from 'prereq_skill_level' then
      raise exception 'companion §6(b): ${GATED.offer_id} below ${GATED.req_skill} ${GATED.req_skill_level} '
                      'answered % (expected prereq_skill_level — the whole new invariant)', v_r;
    end if;
    if (select gold from public.player_state where user_id=v_uid and slot=0) <> v_g1 then
      raise exception 'companion §6(b): a REFUSED gated buy still moved gold';
    end if;

    -- (c) CONTROL — raise the skill to exactly ${GATED.req_skill_level} and it LANDS, charging ${GATED.gold}g.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, 0, ${q(GATED.req_skill)}, public.hr_xp_for_level(${GATED.req_skill_level}))
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    select version, gold into v_ver, v_g0 from public.player_state where user_id=v_uid and slot=0;
    v_key := gen_random_uuid();
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, v_key, ${q(GATED.offer_id)});
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'companion §6(c) CONTROL FAILED: ${GATED.offer_id} refused at ${GATED.req_skill} ${GATED.req_skill_level} (%)', v_r;
    end if;
    select gold into v_g1 from public.player_state where user_id=v_uid and slot=0;
    if v_g1 <> v_g0 - ${GATED.gold} then
      raise exception 'companion §6(c): ${GATED.offer_id} charged %g, expected ${GATED.gold}', v_g0 - v_g1;
    end if;

    -- (d) …and a replay under the same key pays EXACTLY ONCE.
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, v_key, ${q(GATED.offer_id)});
    if coalesce(v_r->>'replayed','false') <> 'true' then
      raise exception 'companion §6(d): ${GATED.offer_id} replay not reported as one (%)', v_r;
    end if;
    if (select gold from public.player_state where user_id=v_uid and slot=0) <> v_g1 then
      raise exception 'companion §6(d): the replay CHARGED AGAIN';
    end if;

    -- (e) …and a fresh key on the owned companion is 'already_owned', not a double charge.
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), ${q(GATED.offer_id)});
    if v_r->>'error' is distinct from 'already_owned' then
      raise exception 'companion §6(e): a second ${GATED.offer_id} answered % (expected already_owned)', v_r;
    end if;
${g2}
    raise exception using errcode = 'HRB19', message = 'companion §6 complete — rolling back';
  exception when sqlstate 'HRB19' then
    null;
  end;

  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'companion §6 LEAKED a probe row';
  end if;

  raise notice 'COMPANIONS OK — the skill gate refuses a gated companion below its level and lets it '
               'through at/above; an ungated companion sells; a replay pays once; a re-buy is '
               'already_owned. Every refusal paired with a control. Zero residue.';
end $$;

do $$
begin
  raise notice 'gold-spend slice 4 INSTALLED — ${nSell} companions sellable through hr_unlock_buy, '
               '${nSkillGated} gated on the server-owned skill level via req_skill/req_skill_level.';
end $$;
`;
}

// ── OUTPUT MODE ──────────────────────────────────────────────────────────
const file = await build();
if (REPORT) {
  console.log(`gen-companion-unlocks: ${nSell} offers (${nSkillGated} skill-gated), digest ${DIGEST.slice(0, 12)}…`);
  for (const r of COMPANION_OFFERS) {
    console.log(`  ${r.offer_id.padEnd(20)} ${String(r.gold).padStart(6)}g  `
      + (r.req_skill ? `req ${r.req_skill} ${r.req_skill_level}` : '(ungated)'));
  }
} else if (CHECK) {
  const existing = await readFile(OUT, 'utf8').catch(() => null);
  if (existing === null) die(`${OUT} is missing. Run: node tools/gen-companion-unlocks.mjs`);
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (norm(existing) !== norm(file)) {
    console.error('companion-unlock drift: the manifest, companions.js, or the derived hr_unlock_buy');
    console.error('  moved and the committed migration no longer matches. hr_unlock_buy charges out of');
    console.error('  that table and runs that body. Run: node tools/gen-companion-unlocks.mjs');
    process.exit(1);
  }
  console.log(`companion unlocks in sync (${nSell} offers, digest ${DIGEST.slice(0, 12)}…)`);
} else {
  await writeFile(OUT, file, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(`  ${nSell} offers · ${nSkillGated} skill-gated · digest ${DIGEST}`);
}
