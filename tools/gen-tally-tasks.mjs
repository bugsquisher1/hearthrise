#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-tally-tasks.mjs — GENERATE TAMSIN'S TALLY CATALOGUE.
//
// src/data/tally-tasks.js is the single source of the kill tasks (the monster,
// the ground, the count, the gold, the materials) and their rules; the loot
// bands (src/data/monsters.js `band: 'scarce'` rows, src/data/loot-bands.js) are
// the single source of what Tamsin can pick. Postgres must know both to do what
// only it may: count the server's kills against a held task, pay it once, and
// pick the next piece the hero has not been given. Emitted here as:
//   hr_tally_config     the held / paid-per-day limits, the weights, her slot order
//   hr_tally_tasks      one row per task (upserted: held tasks point at it)
//   hr_tally_pieces     per ground, every Scarce ARMOUR piece its creatures drop,
//                       with its weight, slot and tier (weapons are not picked)
//   hr_tally_materials  per task, the materials she gives once every piece is given
//
//   Regenerate:  node tools/gen-tally-tasks.mjs
//   Verify:      node tools/gen-tally-tasks.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-tally-tasks.mjs --selftest  (every refusal bites)
//
// REFUSES (throws, nothing written): any problem validateTallyTasks() names; a task
// whose hunt has no ground, or whose monster does not spawn on that ground; a
// ground with no Scarce armour piece (the pick would be materials only: said
// loudly, never silently); a Scarce piece that is not an item, has no slot or
// no armour weight.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_FILE = '2026-12-23-tally-catalogue.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', OUT_FILE);

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const arr = (xs) => 'array[' + xs.map(lit).join(', ') + ']::text[]';

/** The monsters that stand on a ground (every pocket's spawns and pack), sorted. */
export function groundMonsters(ground) {
  const out = new Set();
  for (const p of ground.pockets || []) for (const s of [...(p.spawns || []), ...(p.pack || [])]) if (s && s.monster) out.add(s.monster);
  return Array.from(out).sort();
}

/**
 * TAMSIN'S PIECES on a ground: every Scarce drop of its monsters that is worn
 * armour with a weight and a slot, once each, ordered weight, slot (her default
 * order), tier (highest first), id.
 */
export function groundPieces(ground, refs) {
  const { monsters, items, armourWeight, slotOrder } = refs;
  const seen = new Map();
  for (const m of groundMonsters(ground)) {
    for (const d of (monsters[m] && monsters[m].drops) || []) {
      if (!d || d.band !== 'scarce') continue;
      const it = items[d.id];
      if (!it) throw new Error(`gen-tally-tasks: ${m} drops a Scarce ${d.id}, which is no item`);
      if (it.type !== 'armor') continue;            // weapons and off-hands are not hers to give
      const weight = armourWeight[it.armourClass];
      if (!weight || !it.slot) throw new Error(`gen-tally-tasks: the Scarce armour ${d.id} has no weight or slot`);
      if (!seen.has(d.id)) seen.set(d.id, { item: d.id, weight, slot: it.slot, tier: Number.isInteger(it.tier) ? it.tier : 1 });
    }
  }
  const W = ['heavy', 'medium', 'light'];
  const at = (s) => { const i = slotOrder.indexOf(s); return i < 0 ? 99 : i; };
  return Array.from(seen.values()).sort((a, b) => W.indexOf(a.weight) - W.indexOf(b.weight) || at(a.slot) - at(b.slot)
    || b.tier - a.tier || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
}

/** The generated SQL for the data. Throws on anything the server would have to guess about. */
export function buildSql(D) {
  const { tally, monsters, items, hunts, grounds, armourWeight } = D;
  const { TALLY_TASKS, TALLY_RULES, validateTallyTasks } = tally;
  const problems = validateTallyTasks({ monsters, items, hunts }, TALLY_TASKS, TALLY_RULES);
  if (problems.length) throw new Error('gen-tally-tasks: ' + problems.join('; '));
  for (const w of TALLY_RULES.weights) if (!Object.values(armourWeight).includes(w)) throw new Error('gen-tally-tasks: weight ' + w + ' is no armour weight');
  const groundOf = (hunt) => Object.values(grounds).find((g) => g.hunt === hunt) || null;
  const pieces = [];
  const huntsDone = new Set();
  for (const t of TALLY_TASKS) {
    const g = groundOf(t.hunt);
    if (!g) throw new Error(`gen-tally-tasks: task ${t.id} names ${t.hunt}, which has no ground`);
    if (!groundMonsters(g).includes(t.monster)) throw new Error(`gen-tally-tasks: task ${t.id}: ${t.monster} does not spawn on ${t.hunt}`);
    if (huntsDone.has(t.hunt)) continue;
    huntsDone.add(t.hunt);
    const ps = groundPieces(g, { monsters, items, armourWeight, slotOrder: TALLY_RULES.slotOrder });
    if (!ps.length) throw new Error(`gen-tally-tasks: ${t.hunt} drops no Scarce armour: Tamsin could only pick materials there`);
    for (const p of ps) pieces.push({ hunt: t.hunt, ...p });
  }
  const tasks = TALLY_TASKS.map((t, i) => `  (${lit(t.id)}, ${i + 1}, ${lit(t.hunt)}, ${lit(t.monster)}, ${t.count}, ${t.gold}, ${t.party})`);
  const mats = [];
  for (const t of TALLY_TASKS) t.materials.forEach((m, i) => mats.push(`  (${lit(t.id)}, ${i + 1}, ${lit(m.item)}, ${m.qty})`));
  const prow = pieces.map((p) => `  (${lit(p.hunt)}, ${lit(p.item)}, ${lit(p.weight)}, ${lit(p.slot)}, ${p.tier})`);
  const goldSum = TALLY_TASKS.reduce((a, t) => a + t.gold, 0);
  return `-- ════════════════════════════════════════════════════════════════════════
-- Generated by tools/gen-tally-tasks.mjs from src/data/tally-tasks.js (the tasks,
-- the rules, the materials) and the loot bands (src/data/monsters.js Scarce rows on
-- each ground of src/data/hunt-grounds.js). Do not hand-edit:
--   Any hand edit FAILS \`node tools/gen-tally-tasks.mjs --check\`.
-- STAGED (lane/c-tally-tasks). Tamsin's tally: the kill tasks, her limits, the
-- pieces each ground can give and the materials after them. Read by
-- 2026-12-23-tally-tasks.sql, which applies AFTER this file. hr_tally_tasks rows
-- are UPSERTED (held tasks point at them; a removed task REFUSES while a hero holds
-- it, loudly, by design); pieces and materials are replaced whole. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.hr_tally_config (
  only_row     boolean primary key default true check (only_row),
  held_max     int     not null check (held_max between 1 and 3),
  paid_per_day int     not null check (paid_per_day between 1 and 3),
  weights      text[]  not null check (cardinality(weights) between 1 and 3),
  slot_order   text[]  not null check (cardinality(slot_order) between 1 and 8)
);
create table if not exists public.hr_tally_tasks (
  task_id    text    primary key check (task_id ~ '^[a-z0-9_]{1,40}$'),
  ord        int     not null unique check (ord >= 1),
  hunt_id    text    not null check (hunt_id ~ '^[a-z0-9_]{1,40}$'),
  monster_id text    not null check (monster_id ~ '^[a-z0-9_]{1,48}$'),
  target     int     not null check (target between 1 and 100000),
  gold       bigint  not null check (gold between 1 and 1000000),
  party      boolean not null,
  unique (hunt_id, monster_id)
);
create table if not exists public.hr_tally_pieces (
  hunt_id    text not null check (hunt_id ~ '^[a-z0-9_]{1,40}$'),
  item_id    text not null check (item_id ~ '^[a-z0-9_]{1,64}$'),
  weight     text not null check (weight in ('heavy', 'medium', 'light')),
  equip_slot text not null check (equip_slot ~ '^[a-z0-9_]{1,24}$'),
  tier       int  not null check (tier between 1 and 20),
  primary key (hunt_id, item_id)
);
create table if not exists public.hr_tally_materials (
  task_id text not null references public.hr_tally_tasks (task_id) on delete cascade,
  ord     int  not null check (ord between 1 and 6),
  item_id text not null check (item_id ~ '^[a-z0-9_]{1,64}$'),
  qty     int  not null check (qty between 1 and 100),
  primary key (task_id, ord)
);
do $mig$
declare v_t text;
begin
  foreach v_t in array array['hr_tally_config', 'hr_tally_tasks', 'hr_tally_pieces', 'hr_tally_materials'] loop
    execute format('alter table public.%I enable row level security', v_t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_t);
  end loop;
end $mig$;

insert into public.hr_tally_config (only_row, held_max, paid_per_day, weights, slot_order)
  values (true, ${TALLY_RULES.heldMax}, ${TALLY_RULES.paidPerDay}, ${arr(TALLY_RULES.weights)}, ${arr(TALLY_RULES.slotOrder)})
  on conflict (only_row) do update set held_max = excluded.held_max, paid_per_day = excluded.paid_per_day,
    weights = excluded.weights, slot_order = excluded.slot_order;

-- ord is unique: park the old order out of the way before the upsert re-numbers it.
update public.hr_tally_tasks set ord = ord + 1000000;
insert into public.hr_tally_tasks (task_id, ord, hunt_id, monster_id, target, gold, party) values
${tasks.join(',\n')}
  on conflict (task_id) do update set ord = excluded.ord, hunt_id = excluded.hunt_id, monster_id = excluded.monster_id,
    target = excluded.target, gold = excluded.gold, party = excluded.party;
delete from public.hr_tally_tasks where task_id <> all (${arr(TALLY_TASKS.map((t) => t.id))});

delete from public.hr_tally_pieces;
insert into public.hr_tally_pieces (hunt_id, item_id, weight, equip_slot, tier) values
${prow.join(',\n')};

delete from public.hr_tally_materials;
insert into public.hr_tally_materials (task_id, ord, item_id, qty) values
${mats.join(',\n')};

-- SELF-CHECK (CLAUDE.md §4): the rows are exactly the data's; every task stands on its ground; every piece and
-- material is a real item, every piece worn in its slot at its weight; no client reaches the catalogue.
do $$
declare v_role text; v_bad text;
begin
  if (select count(*) from public.hr_tally_tasks) <> ${TALLY_TASKS.length}
     or (select sum(gold) from public.hr_tally_tasks) <> ${goldSum}
     or (select count(*) from public.hr_tally_pieces) <> ${pieces.length}
     or (select count(*) from public.hr_tally_materials) <> ${mats.length}
     or (select held_max from public.hr_tally_config) <> ${TALLY_RULES.heldMax}
     or (select paid_per_day from public.hr_tally_config) <> ${TALLY_RULES.paidPerDay} then
    raise exception 'tally-catalogue: the rows are not the generated set'; end if;
  select t.task_id into v_bad from public.hr_tally_tasks t
   where not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = t.hunt_id)
      or not exists (select 1 from public.hr_hunt_ground_spawns s where s.hunt_id = t.hunt_id and s.monster_id = t.monster_id)
   limit 1;
  if v_bad is not null then raise exception 'tally-catalogue: task % names a ground or a monster the hunt catalogue does not field', v_bad; end if;
  select p.item_id into v_bad from public.hr_tally_pieces p
   where not exists (select 1 from public.hr_items i where i.item_id = p.item_id and i.armour_weight = p.weight)
      or not exists (select 1 from public.hr_item_slots s where s.item_id = p.item_id and s.equip_slot = p.equip_slot)
      or not exists (select 1 from public.hr_tally_tasks t where t.hunt_id = p.hunt_id)
   limit 1;
  if v_bad is not null then raise exception 'tally-catalogue: piece % is not worn armour of its weight and slot in hr_items', v_bad; end if;
  select m.item_id into v_bad from public.hr_tally_materials m
   where not exists (select 1 from public.hr_items i where i.item_id = m.item_id) limit 1;
  if v_bad is not null then raise exception 'tally-catalogue: material % is not in hr_items', v_bad; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_tally_tasks', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hr_tally_pieces', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hr_tally_materials', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hr_tally_config', 'select,insert,update,delete') then
      raise exception 'tally-catalogue: % reaches the catalogue', v_role; end if;
  end loop;
  raise notice 'tally-catalogue: ${TALLY_TASKS.length} tasks (${goldSum} g in all), ${pieces.length} pieces on ${huntsDone.size} grounds, ${mats.length} materials; all green';
end $$;
`;
}

/** The data, read from a tree (the repo, or a mutant copy). */
export async function inputs(root) {
  const u = (p) => pathToFileURL(join(root, ...p.split('/'))).href;
  const tally = await import(u('src/data/tally-tasks.js'));
  const { MONSTERS } = await import(u('src/data/monsters.js'));
  const { ITEMS } = await import(u('src/data/items.js'));
  const { HUNTS } = await import(u('src/data/hunts.js'));
  const { HUNT_GROUNDS } = await import(u('src/data/hunt-grounds.js'));
  const { ARMOUR_WEIGHT } = await import(u('src/data/core-model.js'));
  return { tally, monsters: MONSTERS, items: ITEMS, hunts: HUNTS, grounds: HUNT_GROUNDS, armourWeight: ARMOUR_WEIGHT };
}

async function selftest() {
  const D = await inputs(ROOT);
  let bad = 0;
  const expectThrow = (name, fn) => { try { fn(); console.error('  MISSED  ' + name); bad++; } catch { console.log('  caught  ' + name); } };
  const withTask = (patch) => ({ ...D, tally: { ...D.tally, TALLY_TASKS: D.tally.TALLY_TASKS.map((t, i) => (i === 1 ? { ...t, ...patch } : t)) } });
  expectThrow('a monster that does not spawn on the ground', () => buildSql(withTask({ monster: 'rat_king' })));
  expectThrow('a hunt with no ground', () => buildSql(withTask({ hunt: 'ridge_camp', monster: 'gnoll' })));
  expectThrow('a material that is not an item', () => buildSql(withTask({ materials: [{ item: 'moonstone_dust', qty: 2 }] })));
  expectThrow('a count of 0', () => buildSql(withTask({ count: 0 })));
  expectThrow('a duplicate id', () => buildSql(withTask({ id: D.tally.TALLY_TASKS[0].id })));
  expectThrow('a second task for one ground and monster', () => buildSql(withTask({ hunt: D.tally.TALLY_TASKS[0].hunt, monster: D.tally.TALLY_TASKS[0].monster, id: 'twin_task' })));
  const noScarce = { ...D, monsters: Object.fromEntries(Object.entries(D.monsters).map(([k, m]) => [k, { ...m, drops: (m.drops || []).filter((d) => d.band !== 'scarce') }])) };
  expectThrow('a ground with no Scarce armour', () => buildSql(noScarce));
  const sql = buildSql(D);
  if (!/on conflict \(task_id\) do update/.test(sql)) { console.error('  MISSED  the tasks are not upserted'); bad++; }
  if (/'iron_sword'|'longbow'|'steel_sword'/.test(sql.split('insert into public.hr_tally_pieces')[1].split(';')[0])) { console.error('  MISSED  a weapon is a piece'); bad++; }
  if (bad) { console.error('gen-tally-tasks --selftest: ' + bad + ' refusal(s) did not bite'); process.exit(1); }
  console.log('gen-tally-tasks --selftest: every refusal bites');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const wanted = buildSql(await inputs(ROOT));
  if (process.argv.includes('--check')) {
    const have = await readFile(OUT, 'utf8').catch(() => '');
    if (have.replace(/\r\n/g, '\n') !== wanted) {
      console.error('gen-tally-tasks --check FAILED: ' + OUT_FILE + ' is stale. Run: node tools/gen-tally-tasks.mjs');
      process.exit(1);
    }
    console.log('gen-tally-tasks --check: catalogue matches src/data/tally-tasks.js and the loot bands');
    return;
  }
  await writeFile(OUT, wanted);
  console.log('gen-tally-tasks: wrote ' + OUT_FILE);
}

if (isMain(import.meta.url)) main();
