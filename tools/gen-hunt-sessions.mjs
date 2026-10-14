#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-hunt-sessions.mjs — GENERATE THE SERVER CATALOGUE HUNT SESSIONS
// NEED (ruling HR-2026-10-14, lane C1).
//
// Postgres validates every hunt-session intent against these rows and never
// against a client value. Every row comes from src/data, which stays the one
// source of game content:
//   hr_hunt_supplies       src/data/supplies.js SUPPLIES (kind, essential, heals, buff type)
//   hr_hunt_travel         src/data/hunts.js HUNTS + trainingHunt() of every
//                          non-boss, non-champion monster (travelS)
//   hr_hunt_rule_subjects  src/data/rule-subjects.js RULE_SUBJECTS
//   hr_hunt_buff_types     src/data/supplies.js COMBAT_BUFF_TYPES (a `buff` param)
//   hr_hunt_limits         rule-subjects.js ACTION_SET_LIMITS + COOLDOWN_GROUPS,
//                          hunt-sessions.js SESSION_LIMITS + VIGOUR_LOW_MIN + SESSIONS_KEPT
//                          + DEATH_XP_LOSS (as `death_xp_permille`, lane C2)
//                          + STAMINA_MAX_MS (as `stamina_max_min`, lane C2)
//   hr_hunt_end_reasons    hunt-sessions.js END_ORDER (reason, position) — and,
//                          from the C2 file on, hunt_sessions.end_reason's CHECK
//   hr_hunt_default_preset rule-subjects.js DEFAULT_PRESET
//   hr_hunt_vendor_value   vendorPriceOf (supabase/functions/hr-accrue/catalogue.js)
//                          for every item a vendor buys: the Analyzer's
//                          "Gold at vendor value" and "Waste".
//
// ── WHICH FILE (lane C2, 2026-10-14) ─────────────────────────────────────────
// The catalogue is a FORWARD file: an applied generated file is history and is
// never regenerated in place. 2026-10-21-hunt-sessions-catalogue.generated.sql
// (C1) was APPLIED 2026-10-14 13:39 UTC with 'vigour' in the end order and no
// death-XP row; lane C2's data moved (Vigour ends no hunt; a fall costs XP), so
// and the hunt's meter became stamina (Tyler, same day: 'stamina' takes
// Vigour's place in the end order; the pool's cap is a limits row), so
// the generator now writes 2026-10-22-hunt-sessions-catalogue.generated.sql,
// which the replay applies after C1's and which rewrites every table wholesale.
// The next data move after C2 applies starts a new dated file the same way.
//
//   Regenerate:  node tools/gen-hunt-sessions.mjs
//   Verify:      node tools/gen-hunt-sessions.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-hunt-sessions.mjs --selftest  (the refusals bite)
//
// REFUSES (throws, nothing written): a bad id shape, a supply whose kind is not
// heal/buff/ammo, a heal that heals nothing, a buff with no combat buff type, a
// travel time that is not a multiple of 10 in 10..300, a subject whose range is
// inverted, a default preset slot that names an item no supply row has, and a
// training id that collides with a named hunt.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { HUNTS, trainingHunt } from '../src/data/hunts.js';
import { MONSTERS } from '../src/data/monsters.js';
import { ITEMS } from '../src/data/items.js';
import { SUPPLIES, COMBAT_BUFF_TYPES } from '../src/data/supplies.js';
import { RULE_SUBJECTS, COOLDOWN_GROUPS, ACTION_SET_LIMITS, HEAL_ANY, DEFAULT_PRESET } from '../src/data/rule-subjects.js';
import { SESSION_LIMITS, END_ORDER, VIGOUR_LOW_MIN, SESSIONS_KEPT, DEATH_XP_LOSS, STAMINA_MAX_MS } from '../src/data/hunt-sessions.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_NAME = '2026-10-22-hunt-sessions-catalogue.generated.sql';
export const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const ID = /^[a-z0-9_]{1,64}$/;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const sq = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Every input, validated and normalised into sorted rows. Throws on any defect. */
export function catalogueRows(src = {}) {
  const S = {
    hunts: HUNTS, monsters: MONSTERS, items: ITEMS, supplies: SUPPLIES, buffTypes: COMBAT_BUFF_TYPES,
    subjects: RULE_SUBJECTS, cooldowns: COOLDOWN_GROUPS, setLimits: ACTION_SET_LIMITS,
    sessionLimits: SESSION_LIMITS, endOrder: END_ORDER, preset: DEFAULT_PRESET,
    vigourLow: VIGOUR_LOW_MIN, kept: SESSIONS_KEPT, deathXpLoss: DEATH_XP_LOSS, staminaMaxMs: STAMINA_MAX_MS, ...src,
  };
  const supplies = Object.keys(S.supplies).sort().map((id) => {
    const s = S.supplies[id];
    if (!ID.test(id) || !own(S.items, id)) throw new Error(`supply ${id} is not a catalogued item id`);
    if (!['heal', 'buff', 'ammo'].includes(s.kind)) throw new Error(`supply ${id} has kind ${s.kind}`);
    if (s.kind === 'heal' && !(Number.isInteger(s.heals) && s.heals > 0)) throw new Error(`heal ${id} heals ${s.heals}`);
    const bt = s.kind === 'buff' ? (s.buff && s.buff.type) : null;
    if (s.kind === 'buff' && !S.buffTypes.includes(bt)) throw new Error(`buff ${id} has no combat buff type (${bt})`);
    return { id, kind: s.kind, essential: !!s.essential, heals: s.kind === 'heal' ? s.heals : 0, bt };
  });
  const travel = [];
  const seen = new Set();
  const addTravel = (h, training) => {
    if (!ID.test(h.id)) throw new Error(`hunt id ${h.id} is not [a-z0-9_]{1,64}`);
    if (seen.has(h.id)) throw new Error(`hunt id ${h.id} appears twice (a training id collides with a named hunt)`);
    seen.add(h.id);
    if (!(Number.isInteger(h.travelS) && h.travelS >= 10 && h.travelS <= 300 && h.travelS % 10 === 0)) {
      throw new Error(`hunt ${h.id} travelS ${h.travelS} is not a multiple of 10 in 10..300`);
    }
    travel.push({ id: h.id, s: h.travelS, training });
  };
  for (const h of S.hunts) addTravel(h, false);
  for (const id of Object.keys(S.monsters).sort()) {
    const m = S.monsters[id];
    if (m.boss || m.champion) continue;
    addTravel(trainingHunt(id, m), true);
  }
  travel.sort((a, b) => (a.id < b.id ? -1 : 1));
  const subjects = Object.keys(S.subjects).sort().map((k) => {
    const s = S.subjects[k];
    if (!ID.test(k)) throw new Error(`subject ${k} is not [a-z0-9_]{1,64}`);
    if (s.param !== null && !['buff', 'item'].includes(s.param)) throw new Error(`subject ${k} param ${s.param}`);
    const r = s.range;
    if (r !== null && !(Array.isArray(r) && Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] <= r[1])) {
      throw new Error(`subject ${k} range ${JSON.stringify(r)} is not [lo, hi]`);
    }
    return { k, param: s.param, lo: r ? r[0] : null, hi: r ? r[1] : null };
  });
  const buffTypes = [...S.buffTypes].sort();
  for (const t of buffTypes) if (!ID.test(t)) throw new Error(`buff type ${t} is not [a-z0-9_]{1,64}`);
  const lim = {
    presets: S.setLimits.presets, slots: S.setLimits.slots, conditions: S.setLimits.conditions,
    bag_lines: S.sessionLimits.bagLines,
    falls_min: S.sessionLimits.falls.min, falls_max: S.sessionLimits.falls.max, falls_default: S.sessionLimits.falls.default,
    hours_min: S.sessionLimits.hours.min, hours_max: S.sessionLimits.hours.max,
    cd_heal_ms: S.cooldowns.heal.ms, cd_buff_ms: S.cooldowns.buff.ms,
    vigour_low_min: S.vigourLow, sessions_kept: S.kept,
    /* The price of a fall, in permille of the level's gap. Refused unless the
       fraction is a whole permille in (0, 1000], so the engine's fraction and the
       database's row are the same number exactly — not two roundings of it. */
    death_xp_permille: Math.round(Number(S.deathXpLoss) * 1000),
    /* The stamina pool's cap in WHOLE MINUTES (the limits column is an int up
       to 100000); refused unless STAMINA_MAX_MS is a whole minute > 0. */
    stamina_max_min: Number(S.staminaMaxMs) / 60000,
  };
  if (!(Number.isInteger(lim.stamina_max_min) && lim.stamina_max_min > 0)) {
    throw new Error(`STAMINA_MAX_MS ${S.staminaMaxMs} is not a whole number of minutes > 0`);
  }
  if (!(lim.death_xp_permille > 0 && lim.death_xp_permille <= 1000 && lim.death_xp_permille / 1000 === Number(S.deathXpLoss))) {
    throw new Error(`DEATH_XP_LOSS ${S.deathXpLoss} is not a whole permille in (0, 1]`);
  }
  for (const [k, v] of Object.entries(lim)) {
    if (!(Number.isInteger(v) && v >= 0 && v <= 100000)) throw new Error(`limit ${k} = ${v} is not a whole number in 0..100000`);
  }
  if (!(lim.falls_min <= lim.falls_default && lim.falls_default <= lim.falls_max)) throw new Error('falls default outside its range');
  const ends = S.endOrder.map((r, i) => {
    if (!ID.test(r)) throw new Error(`end reason ${r} is not [a-z0-9_]{1,64}`);
    /* The 2026-10-14 loop-check ruling: Vigour ends no hunt ("no cap on combat"). */
    if (r === 'vigour') throw new Error("END_ORDER names 'vigour': Vigour ends no hunt (designer ruling 2026-10-14)");
    return { r, i: i + 1 };
  });
  const preset = { name: String(S.preset.name), slots: S.preset.slots.map((sl) => {
    if (sl.item !== HEAL_ANY && !(own(S.supplies, sl.item) && ['heal', 'buff'].includes(S.supplies[sl.item].kind))) {
      throw new Error(`the default preset names ${sl.item}, which no heal/buff supply row has`);
    }
    return { item: sl.item, on: !!sl.on, conditions: sl.conditions.map((c) => ({ subject: c.subject, op: c.op, value: c.value })) };
  }) };
  const vendor = Object.keys(S.items).sort().map((id) => ({ id, unit: vendorPriceOf(S.items, id) }))
    .filter((r) => r.unit > 0);
  for (const r of vendor) {
    if (!ID.test(r.id) || !Number.isInteger(r.unit)) throw new Error(`vendor value ${r.id} = ${r.unit}`);
  }
  return { supplies, travel, subjects, buffTypes, lim, ends, preset, vendor };
}

export function render(src) {
  const r = catalogueRows(src);
  const digest = createHash('sha256').update(JSON.stringify(r)).digest('hex');
  const supplyValues = r.supplies.map((s) => `  (${sq(s.id)}, ${sq(s.kind)}, ${s.essential}, ${s.heals}, ${s.bt ? sq(s.bt) : 'null'})`).join(',\n');
  const travelValues = r.travel.map((t) => `  (${sq(t.id)}, ${t.s}, ${t.training})`).join(',\n');
  const subjectValues = r.subjects.map((s) => `  (${sq(s.k)}, ${s.param ? sq(s.param) : 'null'}, ${s.lo ?? 'null'}, ${s.hi ?? 'null'})`).join(',\n');
  const buffValues = r.buffTypes.map((t) => `  (${sq(t)})`).join(',\n');
  const limValues = Object.entries(r.lim).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `  (${sq(k)}, ${v})`).join(',\n');
  const endValues = r.ends.map((e) => `  (${sq(e.r)}, ${e.i})`).join(',\n');
  const endList = r.ends.map((e) => sq(e.r)).join(', ');
  const vendorValues = r.vendor.map((v) => `  (${sq(v.id)}, ${v.unit})`).join(',\n');
  const preset = JSON.stringify(r.preset.slots);
  const nLim = Object.keys(r.lim).length;
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE HUNT SESSION CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-hunt-sessions.mjs from src/data/supplies.js,
--   src/data/rule-subjects.js, src/data/hunt-sessions.js, src/data/hunts.js,
--   src/data/monsters.js and the vendor price (hr-accrue/catalogue.js).
--   Any hand edit FAILS \`node tools/gen-hunt-sessions.mjs --check\`.
--
--   digest: ${digest}
--   ${r.supplies.length} supplies, ${r.travel.length} hunts (named + training), ${r.subjects.length} rule subjects,
--   ${r.buffTypes.length} combat buff types, ${nLim} limits, ${r.ends.length} end reasons, ${r.vendor.length} vendor values
--
-- SUPERSEDES 2026-10-21-hunt-sessions-catalogue.generated.sql (applied; history,
-- never regenerated): every table below is rewritten wholesale.
--
-- Read by the hunt-session RPCs (2026-10-21-hunt-sessions.sql). Server-only:
-- RLS on, NO policy, no client grant (the client reads src/data). Idempotent:
-- delete + insert; nothing references these rows by foreign key.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.hr_hunt_supplies (
  item_id   text primary key check (item_id ~ '^[a-z0-9_]{1,64}$'),
  kind      text not null check (kind in ('heal', 'buff', 'ammo')),
  essential boolean not null,
  heals     int  not null check (heals >= 0),
  buff_type text,
  constraint hr_hunt_supplies_shape_ck check (
    (kind = 'heal' and heals > 0 and buff_type is null)
    or (kind = 'buff' and heals = 0 and buff_type is not null)
    or (kind = 'ammo' and heals = 0 and buff_type is null))
);
create table if not exists public.hr_hunt_travel (
  hunt_id  text primary key check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  travel_s int  not null check (travel_s between 10 and 300 and travel_s % 10 = 0),
  training boolean not null
);
create table if not exists public.hr_hunt_rule_subjects (
  subject text primary key check (subject ~ '^[a-z0-9_]{1,64}$'),
  param   text check (param in ('buff', 'item')),
  lo      int,
  hi      int,
  constraint hr_hunt_rule_subjects_range_ck check ((lo is null) = (hi is null) and (lo is null or lo <= hi))
);
create table if not exists public.hr_hunt_buff_types (
  buff_type text primary key check (buff_type ~ '^[a-z0-9_]{1,64}$')
);
create table if not exists public.hr_hunt_limits (
  key   text primary key check (key ~ '^[a-z0-9_]{1,64}$'),
  value int  not null check (value between 0 and 100000)
);
create table if not exists public.hr_hunt_end_reasons (
  reason text primary key check (reason ~ '^[a-z0-9_]{1,64}$'),
  ord    int  not null unique check (ord >= 1)
);
create table if not exists public.hr_hunt_default_preset (
  id    boolean primary key default true check (id),
  name  text  not null,
  slots jsonb not null check (jsonb_typeof(slots) = 'array')
);
create table if not exists public.hr_hunt_vendor_value (
  item_id text primary key check (item_id ~ '^[a-z0-9_]{1,64}$'),
  unit    bigint not null check (unit >= 1)
);
alter table public.hr_hunt_supplies       enable row level security;
alter table public.hr_hunt_travel         enable row level security;
alter table public.hr_hunt_rule_subjects  enable row level security;
alter table public.hr_hunt_buff_types     enable row level security;
alter table public.hr_hunt_limits         enable row level security;
alter table public.hr_hunt_end_reasons    enable row level security;
alter table public.hr_hunt_default_preset enable row level security;
alter table public.hr_hunt_vendor_value   enable row level security;
revoke all on public.hr_hunt_supplies, public.hr_hunt_travel, public.hr_hunt_rule_subjects,
              public.hr_hunt_buff_types, public.hr_hunt_limits, public.hr_hunt_end_reasons,
              public.hr_hunt_default_preset, public.hr_hunt_vendor_value
  from public, anon, authenticated, service_role;

delete from public.hr_hunt_supplies;
insert into public.hr_hunt_supplies (item_id, kind, essential, heals, buff_type) values
${supplyValues};
delete from public.hr_hunt_travel;
insert into public.hr_hunt_travel (hunt_id, travel_s, training) values
${travelValues};
delete from public.hr_hunt_rule_subjects;
insert into public.hr_hunt_rule_subjects (subject, param, lo, hi) values
${subjectValues};
delete from public.hr_hunt_buff_types;
insert into public.hr_hunt_buff_types (buff_type) values
${buffValues};
delete from public.hr_hunt_limits;
insert into public.hr_hunt_limits (key, value) values
${limValues};
delete from public.hr_hunt_end_reasons;
insert into public.hr_hunt_end_reasons (reason, ord) values
${endValues};
-- hunt_sessions.end_reason's CHECK is END_ORDER too. C1 typed it inline in
-- 2026-10-21-hunt-sessions.sql; from this file on the generator owns it, so the
-- wall and the catalogue cannot name different reasons (2026-10-14: 'vigour'
-- left both). Applies after that file (the table must exist).
alter table public.hunt_sessions drop constraint if exists hunt_sessions_end_reason_check;
alter table public.hunt_sessions add constraint hunt_sessions_end_reason_check
  check (end_reason in (${endList}));
delete from public.hr_hunt_default_preset;
insert into public.hr_hunt_default_preset (id, name, slots) values
  (true, ${sq(r.preset.name)}, ${sq(preset)}::jsonb);
delete from public.hr_hunt_vendor_value;
insert into public.hr_hunt_vendor_value (item_id, unit) values
${vendorValues};

do $$
declare v_role text; v_t text;
begin
  if (select count(*) from public.hr_hunt_supplies) <> ${r.supplies.length}
     or (select count(*) from public.hr_hunt_travel) <> ${r.travel.length}
     or (select count(*) from public.hr_hunt_rule_subjects) <> ${r.subjects.length}
     or (select count(*) from public.hr_hunt_buff_types) <> ${r.buffTypes.length}
     or (select count(*) from public.hr_hunt_limits) <> ${nLim}
     or (select count(*) from public.hr_hunt_end_reasons) <> ${r.ends.length}
     or (select count(*) from public.hr_hunt_default_preset) <> 1
     or (select count(*) from public.hr_hunt_vendor_value) <> ${r.vendor.length} then
    raise exception 'hunt-session catalogue row counts moved from the generator''s'; end if;
  -- Every supply and every vendor value is a catalogued item; every named hunt is
  -- in hr_hunts; every training id is a non-boss combat target.
  if exists (select 1 from public.hr_hunt_supplies s where not exists (select 1 from public.hr_items i where i.item_id = s.item_id))
     or exists (select 1 from public.hr_hunt_vendor_value v where not exists (select 1 from public.hr_items i where i.item_id = v.item_id)) then
    raise exception 'a supply or vendor-value row names an item hr_items does not have'; end if;
  if exists (select 1 from public.hr_hunt_travel t where not t.training
               and not exists (select 1 from public.hr_hunts h where h.hunt_id = t.hunt_id)) then
    raise exception 'a named hunt in hr_hunt_travel is not in hr_hunts'; end if;
  if exists (select 1 from public.hr_hunt_travel t where t.training
               and not exists (select 1 from public.hr_activities a
                                where a.kind = 'combat' and a.activity_id = t.hunt_id and not a.is_boss)) then
    raise exception 'a training id in hr_hunt_travel is not a non-boss combat target'; end if;
  if exists (select 1 from public.hr_hunt_supplies s where s.kind = 'buff'
               and not exists (select 1 from public.hr_hunt_buff_types b where b.buff_type = s.buff_type)) then
    raise exception 'a buff supply names a buff type outside the combat list'; end if;
  -- No client role reads or writes any of them; no policy exists.
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_t in array array['hr_hunt_supplies', 'hr_hunt_travel', 'hr_hunt_rule_subjects', 'hr_hunt_buff_types',
                               'hr_hunt_limits', 'hr_hunt_end_reasons', 'hr_hunt_default_preset', 'hr_hunt_vendor_value'] loop
      if has_table_privilege(v_role, 'public.' || v_t, 'select,insert,update,delete,truncate') then
        raise exception '% holds a privilege on %', v_role, v_t; end if;
    end loop;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public'
               and tablename in ('hr_hunt_supplies', 'hr_hunt_travel', 'hr_hunt_rule_subjects', 'hr_hunt_buff_types',
                                 'hr_hunt_limits', 'hr_hunt_end_reasons', 'hr_hunt_default_preset', 'hr_hunt_vendor_value')) then
    raise exception 'a policy exists on the hunt-session catalogue'; end if;
end $$;
`;
}

/* --selftest: every refusal bites, and the shipped data passes. */
function selftest() {
  catalogueRows();
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const S = { supplies: clone(SUPPLIES), hunts: clone(HUNTS), subjects: clone(RULE_SUBJECTS), preset: clone(DEFAULT_PRESET) };
  const cases = {
    'supply of unknown kind': () => ({ supplies: { ...S.supplies, cooked_shrimp: { ...S.supplies.cooked_shrimp, kind: 'snack' } } }),
    'heal that heals nothing': () => ({ supplies: { ...S.supplies, cooked_shrimp: { ...S.supplies.cooked_shrimp, heals: 0 } } }),
    'supply not an item': () => ({ supplies: { ...S.supplies, not_an_item: { kind: 'heal', essential: true, heals: 3 } } }),
    'buff with an idle type': () => ({ supplies: { ...S.supplies, tomato_soup: { ...S.supplies.tomato_soup, buff: { type: 'gather_speed' } } } }),
    'travel not a multiple of 10': () => ({ hunts: S.hunts.map((h, i) => (i ? h : { ...h, travelS: 25 })) }),
    'travel too long': () => ({ hunts: S.hunts.map((h, i) => (i ? h : { ...h, travelS: 310 })) }),
    'training id collides': () => ({ hunts: [...S.hunts, { ...S.hunts[0], id: 'rat' }] }),
    'inverted subject range': () => ({ subjects: { ...S.subjects, self_hp_pct: { ...S.subjects.self_hp_pct, range: [99, 1] } } }),
    'unknown subject param': () => ({ subjects: { ...S.subjects, self_hp_pct: { ...S.subjects.self_hp_pct, param: 'monster' } } }),
    'preset names a non-supply': () => ({ preset: { ...S.preset, slots: [{ item: 'iron_bar', on: true, conditions: [] }] } }),
    'vigour back in the end order': () => ({ endOrder: [...END_ORDER, 'vigour'] }),
    'a death XP loss that is not a whole permille': () => ({ deathXpLoss: 0.0205 }),
    'a death XP loss of nothing': () => ({ deathXpLoss: 0 }),
    'a stamina cap that is not a whole minute': () => ({ staminaMaxMs: 12 * 3600000 + 1 }),
    'no stamina cap': () => ({ staminaMaxMs: 0 }),
  };
  let bad = 0;
  for (const [name, mk] of Object.entries(cases)) {
    let threw = false;
    try { catalogueRows(mk()); } catch { threw = true; }
    console.log(`  ${threw ? 'ok ' : 'RED'} refuses: ${name}`);
    if (!threw) bad++;
  }
  if (bad) { console.error(`gen-hunt-sessions --selftest: ${bad} refusal(s) did not bite`); process.exit(1); }
  console.log('gen-hunt-sessions --selftest: every refusal bites; shipped data passes');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv.includes('--selftest')) {
    selftest();
  } else {
    const wanted = render();
    if (process.argv.includes('--check')) {
      const have = await readFile(OUT, 'utf8').catch(() => '');
      if (have.replace(/\r\n/g, '\n') !== wanted) {
        console.error(`gen-hunt-sessions --check FAILED: ${OUT_NAME} is stale. Run: node tools/gen-hunt-sessions.mjs`);
        process.exit(1);
      }
      console.log('gen-hunt-sessions --check: catalogue matches src/data');
    } else {
      await writeFile(OUT, wanted);
      console.log(`wrote ${OUT}`);
    }
  }
}
