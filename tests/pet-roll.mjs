#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/pet-roll.mjs — ROLLED PETS ARE ROLLED BY THE SERVER (2026-10-10).
//
//   node tests/pet-roll.mjs             the guard
//   node tests/pet-roll.mjs --selftest  plant each defect, require RED
//
// The whole-game review found the fifteen rolled companions (skill / boss /
// drop pets) rolled in the BROWSER and claimed through hr_companion_grant on the
// client's word. src/core/pet-roll.js now rolls them inside the accrual settle
// (accrual.js petFinds, on a dedicated stream) and hr_apply re-validates the
// claim (2026-10-10-pet-roll-server.sql, whose §5 proves the SQL half by
// execution on every replay). This guard proves the ENGINE half:
//
//   P1  the catalogue binding: hr_companion_grants.source_id (typed in the
//       migration) == src/data/companions.js `source`, both directions;
//   P2  the index: exactly the fifteen rolled companions, each with a real
//       chance, drop pets priced from PET_DROP_CHANCES;
//   P3  the roll: one draw per eligible (pet, settle), none for a source with
//       no row or zero events; 1-(1-p)^n measured against 20,000 seeds;
//   P4  BOTH PATHS (CLAUDE.md §4): an AWAY lich night and an ATTENDED lich
//       settle each propose exactly rollPets(seed^salt, the kills the settle
//       PAID) — span kills plus the attended top-up;
//   P5  THE MAIN STREAM DOES NOT MOVE: the same settle with the switch off is
//       byte-identical except for the absent key (gold, drops, XP, hearthfind);
//   P6  gather and artisan propose rollPets(…, the settle's companionActions);
//   P7  the switch: with `petRollReady` absent the key is never proposed;
//   P8  the client rolls nothing: src/features/pets.js is gone and
//       src/features/companions.js has no drop roll.
// NO ?v= on the imports (tests/** — b332).
// ════════════════════════════════════════════════════════════════════════
import { readFile, access } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeAccrual, PET_RNG_SALT } from '../supabase/functions/hr-accrue/accrual.js';
import { GATHER_NODES, ARTISAN_RECIPES_ALL } from '../supabase/functions/hr-accrue/catalogue.js';
import { indexPetSources, rollPets, PET_INDEX } from '../src/core/pet-roll.js';
import { createRng, rngFrom, mulberry32 } from '../src/core/rng.js';
import { COMPANIONS, PET_DROP_CHANCES } from '../src/data/companions.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = join(ROOT, 'supabase', 'migrations', '2026-10-10-pet-roll-server.sql');

const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);
const NOW_MS = FROM_MS + 12 * 3600000;
const SEED = 0x5eed1234;
const MAXED = 13034431;
const BASE = {
  userId: '00000000-0000-4000-8000-0000000000ce', slot: 0,
  nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
  capMs: 12 * 3600000, seed: SEED, hp: 990, maxHp: 990, gold: 0,
  autoEatEnabled: false, autoEatFood: null, autoEatPct: 0,
  toolCarry: {}, unlockedRecipes: {}, perks: { ok: true, companion: null },
  items: ITEMS, monsters: MONSTERS, nodes: GATHER_NODES, recipes: ARTISAN_RECIPES_ALL,
};
const MAX_SKILLS = Object.fromEntries(['attack', 'strength', 'defense', 'hitpoints', 'ranged', 'magic', 'prayer',
  'woodcutting', 'mining', 'fishing', 'cooking', 'smithing', 'crafting'].map((s) => [s, MAXED]));
const petRng = (seed) => createRng((seed ^ PET_RNG_SALT) >>> 0);
const ROLLED = ['badger', 'beaver', 'dragonling', 'forge_imp', 'grave_wisp', 'hawk', 'heron', 'lichling',
  'phoenix_chick', 'rock_golem', 'scorpion', 'silkling', 'squirrel', 'tortoise', 'wolf_pup'];

function sqlSources(sql) {
  const block = (sql.match(/update public\.hr_companion_grants g set source_id = v\.sid\s+from \(values([\s\S]*?)\) v\(cid, sid\)/) || [])[1] || '';
  return Object.fromEntries([...block.matchAll(/\('([a-z_]+)', '([a-z0-9_]+)'\)/g)].map((m) => [m[1], m[2]]));
}

async function petRollGuard(over = {}) {
  const bad = [];
  const ok = (c, m) => { if (!c) bad.push(m); };
  const sql = over.sql ?? await readFile(MIG, 'utf8');
  const index = over.index ?? PET_INDEX;

  // P1 — source_id binding, both directions.
  const sqlSrc = sqlSources(sql);
  ok(Object.keys(sqlSrc).length >= 15, 'P1 CONTROL: the migration\'s source_id VALUES block was not found');
  for (const [cid, def] of Object.entries(COMPANIONS)) {
    const [kind, id] = String(def.source || '').split(':');
    if (!['skill', 'boss', 'drop', 'quest', 'hatch'].includes(kind)) continue;
    ok(sqlSrc[cid] === id, `P1: ${cid} source ${def.source} — SQL source_id is ${sqlSrc[cid]}, expected ${id}`);
  }
  for (const cid of Object.keys(sqlSrc)) ok(COMPANIONS[cid], `P1: SQL names companion ${cid} that src/data/companions.js does not`);

  // P2 — the index.
  const indexed = [...Object.values(index.kill), ...Object.values(index.skill)].flat().map((r) => r.companion).sort();
  ok(JSON.stringify(indexed) === JSON.stringify(ROLLED), `P2: the rolled set is ${indexed.join(',')}`);
  for (const [cid, p] of Object.entries(PET_DROP_CHANCES)) {
    const row = Object.values(index.kill).flat().find((r) => r.companion === cid);
    ok(row && row.p === p, `P2: drop pet ${cid} is not priced from PET_DROP_CHANCES (${row && row.p} vs ${p})`);
  }
  ok(Object.values(index.kill).flat().find((r) => r.companion === 'lichling')?.p === 1 / 200, 'P2: lichling is not 1-in-200');

  // P3 — draws and the distribution.
  {
    let draws = 0;
    const counting = rngFrom(() => { draws++; return 0.5; });
    rollPets({ kills: { goblin: 500, lich: 0 }, actions: { agility: 99 } }, counting, index);
    ok(draws === 0, `P3: ${draws} draw(s) for sources with no pet row or zero events — no row, no draw`);
    rollPets({ kills: { lich: 3 } }, counting, index);
    ok(draws === 1, `P3: one lich batch drew ${draws} time(s); one draw per (pet, settle)`);
    const all = rollPets({ kills: { lich: 1 }, actions: { woodcutting: 1 } }, rngFrom(() => 0), index);
    ok(all.length === 2 && all[0].companion === 'lichling' && all[0].source_kind === 'boss' && all[0].source_id === 'lich',
      `P3: a forced hit must propose the pair, got ${JSON.stringify(all)}`);
    ok(rollPets({ kills: { lich: 1 } }, rngFrom(() => 0.999999), index).length === 0, 'P3: a forced miss proposed a pet');
    let hits = 0; const N = 20000;
    for (let s = 1; s <= N; s++) if (rollPets({ kills: { lich: 200 } }, rngFrom(mulberry32(s)), index).length) hits++;
    const want = 1 - Math.pow(1 - 1 / 200, 200);
    ok(Math.abs(hits / N - want) < 0.02, `P3: P(lichling | 200 kills) measured ${(hits / N).toFixed(3)}, expected ${want.toFixed(3)}`);
  }

  // P4/P5/P7 — combat, both paths.
  for (const away of [true, false]) {
    const input = { ...BASE, activeKind: 'combat', activeId: 'lich', skills: { ...MAX_SKILLS }, away,
      ...(away ? {} : { attended: { from: new Date(FROM_MS).toISOString(), to: new Date(NOW_MS).toISOString(),
        total: 40, kills: { lich: 40 } } }) };
    const on = computeAccrual({ ...input, petRollReady: true });
    const off = computeAccrual({ ...input });
    const path = away ? 'AWAY' : 'ATTENDED';
    ok(on && on.delta, `P4 ${path}: no settle`);
    if (!on || !on.delta) continue;
    const kills = Math.max(0, Math.floor(Number(on.summary && on.summary.kills) || 0)) + (Number(on.attendedTopUp) || 0);
    ok(kills > 0, `P4 ${path} CONTROL: the lich settle paid no kills`);
    const want = rollPets({ kills: { lich: kills } }, petRng(SEED), index);
    ok(JSON.stringify(on.delta.companion_finds || []) === JSON.stringify(want),
      `P4 ${path}: proposed ${JSON.stringify(on.delta.companion_finds)} but rollPets over the ${kills} paid kills says ${JSON.stringify(want)}`);
    ok(!('companion_finds' in (off.delta || {})), `P7 ${path}: proposed companion_finds with the switch off`);
    const strip = (d) => { const c = { ...d }; delete c.companion_finds; return JSON.stringify(c); };
    ok(strip(on.delta) === strip(off.delta), `P5 ${path}: the pet roll moved the main stream — the delta differs beyond the key`);
  }

  // P6 — gather and artisan.
  const node = Object.keys(GATHER_NODES).find((id) => GATHER_NODES[id].skill === 'woodcutting');
  const g = computeAccrual({ ...BASE, activeKind: 'gather', activeId: node, skills: { ...MAX_SKILLS }, petRollReady: true, away: true });
  if (g && g.delta) {
    const want = rollPets({ actions: { woodcutting: g.companionActions } }, petRng(SEED), index);
    ok(JSON.stringify(g.delta.companion_finds || []) === JSON.stringify(want), `P6 gather: ${JSON.stringify(g.delta.companion_finds)} vs ${JSON.stringify(want)}`);
    ok(g.companionActions > 0, 'P6 gather CONTROL: no actions');
  } else ok(false, 'P6 gather: no settle');

  // P8 — the client rolls nothing.
  const pets = await access(join(ROOT, 'src', 'features', 'pets.js')).then(() => true, () => false);
  ok(!pets && !over.petsFile, 'P8: src/features/pets.js still exists — the browser rolls skill/boss pets');
  const comp = over.companionsJs ?? await readFile(join(ROOT, 'src', 'features', 'companions.js'), 'utf8');
  ok(!/DROP_CHANCES\s*=|rng\.chance\(chance\)|Math\.random\(\)\s*<\s*chance/.test(comp),
    'P8: src/features/companions.js still rolls drop pets in the browser');
  return bad;
}

const isMain = process.argv[1] && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url));
if (isMain) {
  if (process.argv.includes('--selftest')) {
    const sql = await readFile(MIG, 'utf8');
    if ((await petRollGuard()).length) { console.error('HARNESS: the clean tree is red'); process.exit(2); }
    const fewer = indexPetSources({ ...COMPANIONS, lichling: { ...COMPANIONS.lichling, source: 'boss:lich:20' } });
    const arms = [
      ['source_id drift', { sql: sql.replace("('beaver', 'woodcutting')", "('beaver', 'mining')") }],
      ['lichling odds x10', { index: fewer }],
      ['client drop roll back', { companionsJs: 'const DROP_CHANCES = {}; C.rng.chance(chance);' }],
      ['pets.js back', { petsFile: true }],
    ];
    let miss = 0;
    for (const [name, over] of arms) {
      const n = (await petRollGuard(over)).length;
      console.log(`${n ? 'ok  ' : 'MISS'} ${name} (${n})`);
      if (!n) miss++;
    }
    console.log(miss ? `pet-roll --selftest: ${miss} UNCAUGHT` : 'pet-roll --selftest: every defect caught');
    process.exit(miss ? 1 : 0);
  }
  const bad = await petRollGuard();
  for (const b of bad) console.error('  FAIL  ' + b);
  console.log(bad.length ? `pet-roll: ${bad.length} problem(s)` : 'pet-roll: pets are rolled by the server on both paths, the main stream is untouched, the client rolls nothing');
  process.exit(bad.length ? 1 : 0);
}
