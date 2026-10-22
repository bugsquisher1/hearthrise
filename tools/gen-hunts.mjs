#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-hunts.mjs — GENERATE THE SERVER HUNT CATALOGUE (lane C1).
//
// src/data/hunts.js is the single source of the named hunts. Postgres must know
// two facts to enforce what only it can enforce: a hunt's combat-level floor
// (hr_apply refuses `activity_locked` below band[0]) and its spawn set
// (hr_apply's fight-carry void keeps a checkpoint only on one of THIS hunt's
// monsters). Both are emitted here as `hr_hunts` / `hr_hunt_spawns`; nothing
// else about a hunt (name, theme, art) goes to SQL.
//
//   Regenerate:  node tools/gen-hunts.mjs
//   Verify:      node tools/gen-hunts.mjs --check   (exit 1 on drift)
//   Selftest:    node tools/gen-hunts.mjs --selftest (the refusals bite)
//
// REFUSES (throws, nothing written): an unknown monster id, a hunt id that is
// also a monster id (the pointer would be ambiguous), a bad id shape, duplicate
// hunt or spawn ids, a non-positive/non-integer weight, an invalid band, and
// (Security C2) a spawn that carries its OWN gate — a skill requirement, or a
// boss/champion flag — because a hunt's only gate is band[0] and a gated
// monster inside a hunt would be fought without its own gate ever being asked.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { HUNTS, OPEN_HUNTS } from '../src/data/hunts.js';
import { MONSTERS } from '../src/data/monsters.js';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* 2026-10-20 and 2026-10-24-hunts-catalogue.generated.sql are APPLIED history (the Sewer hunt
   landed in the 10-24 one); the Meadowbrook Thicket and the Coppercap Warrens (lane
   hunts-forest-cave, integration v0.2.1) landed in 2026-10-25 (APPLIED history). The core rebuild's
   Level bands (CORE_NUMBERS_2026-10-19 Q9: the cellar 1-8, the sewer 8-25) landed in 2026-10-27 (APPLIED
   history). Mosslight Glade opens on its style-1 art (lane b-mosslight-art, 2026-10-22) in this forward
   file, which rewrites the same tables. */
export const OUT_NAME = '2026-11-13-hunts-catalogue.generated.sql';
export const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const ID = /^[a-z0-9_]{1,64}$/;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/* A monster field that gates fighting it. Any of these on a spawn is refused. */
const GATE_KEYS = ['reqSkill', 'reqLv', 'req', 'req_skill', 'req_lv', 'boss', 'champion'];

/** Validate `hunts` against `monsters`; returns normalised rows or throws. */
export function huntRows(hunts, monsters) {
  const seen = new Set();
  return hunts.map((h) => {
    if (!h || !ID.test(h.id)) throw new Error(`hunt id ${h && h.id} is not [a-z0-9_]{1,64}`);
    if (seen.has(h.id)) throw new Error(`hunt id ${h.id} is duplicated`);
    seen.add(h.id);
    if (own(monsters, h.id)) throw new Error(`hunt id ${h.id} is also a monster id`);
    for (const k of ['name', 'theme', 'family', 'art']) {
      if (typeof h[k] !== 'string' || !h[k]) throw new Error(`hunt ${h.id} has no ${k}`);
    }
    const [lo, hi] = Array.isArray(h.band) ? h.band : [];
    if (!(Number.isInteger(lo) && Number.isInteger(hi) && lo >= 0 && hi >= lo && hi <= 200)) {
      throw new Error(`hunt ${h.id} has an invalid band ${JSON.stringify(h.band)}`);
    }
    if (!Array.isArray(h.spawns) || h.spawns.length === 0) throw new Error(`hunt ${h.id} has no spawns`);
    const mons = new Set();
    const spawns = h.spawns.map((s) => {
      if (!s || !own(monsters, s.monster)) throw new Error(`hunt ${h.id} names unknown monster ${s && s.monster}`);
      if (mons.has(s.monster)) throw new Error(`hunt ${h.id} lists ${s.monster} twice`);
      const m = monsters[s.monster];
      for (const g of GATE_KEYS) {
        if (m[g] !== undefined && m[g] !== null && m[g] !== false) {
          throw new Error(`hunt ${h.id} spawn ${s.monster} carries its own gate (${g}); gated monsters are fought by declaration only`);
        }
      }
      mons.add(s.monster);
      if (!(Number.isInteger(s.w) && s.w >= 1 && s.w <= 1000)) {
        throw new Error(`hunt ${h.id} spawn ${s.monster} has invalid weight ${s.w}`);
      }
      return [s.monster, s.w];
    });
    if (!own(monsters, h.art)) throw new Error(`hunt ${h.id} art ${h.art} is not a monster id`);
    return { id: h.id, lo, hi, spawns };
  }).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/* A STAGED hunt (hunts.js `staged`: built, art pending) is not served: hr_hunts never names it. */
export function render(hunts = OPEN_HUNTS, monsters = MONSTERS) {
  const r = huntRows(hunts, monsters);
  const digest = createHash('sha256').update(JSON.stringify(r)).digest('hex');
  const nSpawns = r.reduce((n, h) => n + h.spawns.length, 0);
  const huntValues = r.map((h) => `  ('${h.id}', ${h.lo}, ${h.hi})`).join(',\n');
  const spawnValues = r.flatMap((h) => h.spawns.map(([m, w]) => `  ('${h.id}', '${m}', ${w})`)).join(',\n');
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE HUNT CATALOGUE  (GENERATED — DO NOT EDIT)
--
--   Generated by tools/gen-hunts.mjs from src/data/hunts.js.
--   Any hand edit FAILS \`node tools/gen-hunts.mjs --check\`.
--
--   hunt digest: ${digest}
--   ${r.length} hunts, ${nSpawns} spawns
--
-- Read by hr_apply (2026-10-20-hunts-start-gate.sql): the band floor and the
-- spawn set. Server-only: RLS on, NO policy, no client grant (the client reads
-- src/data/hunts.js). Idempotent: delete+insert inside the migration.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.hr_hunts (
  hunt_id  text primary key check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  band_min int  not null check (band_min >= 0),
  band_max int  not null,
  constraint hr_hunts_band_ck check (band_max >= band_min)
);
create table if not exists public.hr_hunt_spawns (
  hunt_id    text not null references public.hr_hunts (hunt_id) on delete cascade,
  monster_id text not null,
  w          int  not null check (w between 1 and 1000),
  primary key (hunt_id, monster_id)
);
alter table public.hr_hunts enable row level security;
alter table public.hr_hunt_spawns enable row level security;
revoke all on public.hr_hunts, public.hr_hunt_spawns from public, anon, authenticated, service_role;

delete from public.hr_hunt_spawns;
delete from public.hr_hunts;
insert into public.hr_hunts (hunt_id, band_min, band_max) values
${huntValues};
insert into public.hr_hunt_spawns (hunt_id, monster_id, w) values
${spawnValues};

do $$
declare v_n int; v_role text;
begin
  select count(*) into v_n from public.hr_hunts;
  if v_n <> ${r.length} then raise exception 'hr_hunts has % rows, expected ${r.length}', v_n; end if;
  select count(*) into v_n from public.hr_hunt_spawns;
  if v_n <> ${nSpawns} then raise exception 'hr_hunt_spawns has % rows, expected ${nSpawns}', v_n; end if;
  -- Every spawn is a catalogued combat target, and no hunt id is one (disjoint pointers).
  if exists (select 1 from public.hr_hunt_spawns s where not exists (
               select 1 from public.hr_activities a where a.kind = 'combat' and a.activity_id = s.monster_id)) then
    raise exception 'hr_hunt_spawns names a monster that is not in hr_activities'; end if;
  if exists (select 1 from public.hr_hunts h join public.hr_activities a on a.activity_id = h.hunt_id) then
    raise exception 'a hunt id collides with an hr_activities id'; end if;
  -- Security C2: no spawn carries its own gate (a skill requirement or a boss flag).
  if exists (select 1 from public.hr_hunt_spawns s join public.hr_activities a
               on a.kind = 'combat' and a.activity_id = s.monster_id
              where a.req_skill is not null or a.req_lv is not null or a.is_boss) then
    raise exception 'a hunt spawn carries its own gate (req_skill / req_lv / is_boss)'; end if;
  -- No client role reads or writes either table; no policy exists.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_hunts', 'select,insert,update,delete,truncate')
       or has_table_privilege(v_role, 'public.hr_hunt_spawns', 'select,insert,update,delete,truncate') then
      raise exception '% holds a privilege on the hunt catalogue', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('hr_hunts', 'hr_hunt_spawns')) then
    raise exception 'a policy exists on the hunt catalogue'; end if;
end $$;
`;
}

/* --selftest: every refusal bites, and the shipped data passes. */
const BOSS = Object.keys(MONSTERS).find((id) => MONSTERS[id].boss === true);

function selftest() {
  if (!BOSS) { console.error('gen-hunts --selftest CANNOT RUN: no boss in the roster'); process.exit(2); }
  const base = HUNTS.map((h) => ({ ...h, spawns: h.spawns.map((s) => ({ ...s })) }));
  const cases = {
    'unknown monster': (b) => { b[0].spawns[0].monster = 'not_a_monster'; },
    'hunt id is a monster id': (b) => { b[0].id = 'rat'; },
    'bad id shape': (b) => { b[0].id = 'Mill Cellar'; },
    'duplicate hunt': (b) => { b[1].id = b[0].id; },
    'duplicate spawn': (b) => { b[0].spawns[1].monster = b[0].spawns[0].monster; },
    'zero weight': (b) => { b[0].spawns[0].w = 0; },
    'fractional weight': (b) => { b[0].spawns[0].w = 1.5; },
    'inverted band': (b) => { b[0].band = [10, 5]; },
    'proto id': (b) => { b[0].spawns[0].monster = 'constructor'; },
    'skill-gated spawn': (b) => { b[0].spawns[0].monster = '__gated_probe'; },
    'boss spawn': (b) => { b[0].spawns[0].monster = BOSS; },
  };
  let bad = 0;
  huntRows(base, MONSTERS);
  /* The skill-gate case needs a monster that carries one; none does today. */
  const withGated = { ...MONSTERS, __gated_probe: { ...MONSTERS.rat, reqSkill: 'attack', reqLv: 50 } };
  for (const [name, mut] of Object.entries(cases)) {
    const b = base.map((h) => ({ ...h, band: [...h.band], spawns: h.spawns.map((s) => ({ ...s })) }));
    mut(b);
    let threw = false;
    try { huntRows(b, withGated); } catch { threw = true; }
    console.log(`  ${threw ? 'ok ' : 'RED'} refuses: ${name}`);
    if (!threw) bad++;
  }
  if (bad) { console.error(`gen-hunts --selftest: ${bad} refusal(s) did not bite`); process.exit(1); }
  console.log('gen-hunts --selftest: every refusal bites; shipped data passes');
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) {
    selftest();
  } else {
    const wanted = render();
    if (process.argv.includes('--check')) {
      const have = await readFile(OUT, 'utf8').catch(() => '');
      if (have.replace(/\r\n/g, '\n') !== wanted) {
        console.error('gen-hunts --check FAILED: ' + OUT_NAME + ' is stale. Run: node tools/gen-hunts.mjs');
        process.exit(1);
      }
      console.log('gen-hunts --check: catalogue matches src/data/hunts.js');
    } else {
      await writeFile(OUT, wanted);
      console.log(`wrote ${OUT}`);
    }
  }
}
