// ════════════════════════════════════════════════════════════════════════
// tests/companion-pays-parity.mjs — THE ENGINE PAYS A COMBAT/PROC PET NOTHING
// BUT ITS XP ROW, so the client may show nothing else.
//
// The in-page COMP-PAYS-1 pins the ATTENDED half: the client applies and
// renders only src/core/companion-perk.js COMPANION_KEYS. This is the AWAY
// half: the hr-accrue engine, run for real over a 12h goblin night and a 12h
// gather night, must produce a byte-identical result with a combat/proc pet
// equipped and with no pet — except the `stat companion_xp:<id>` op. No combat
// stat, no crit, no proc, no rareDrop, at level 1 and at level 30. For the
// passive-paying pets (fox raccoon sparrow lichling) only `kills` is pinned;
// their passive difference belongs to tests/perk-channel.mjs.
//
//   node tests/companion-pays-parity.mjs             gate (exit 0 = green)
//   node tests/companion-pays-parity.mjs --selftest  proves the identity can go red
// ════════════════════════════════════════════════════════════════════════

import { pathToFileURL } from 'node:url';

import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import { GATHER_NODES, ARTISAN_RECIPES_ALL } from '../supabase/functions/hr-accrue/catalogue.js';
import { companionXpToReach } from '../src/core/companion-perk.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';

const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);
const MAXED = 13034431;   // level 99
const BASE = {
  userId: '00000000-0000-4000-8000-0000000000cd', slot: 0,
  nowMs: FROM_MS + 12 * 3600000, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
  capMs: 12 * 3600000, seed: 0x5eed4321, hp: 990, maxHp: 990, gold: 0,
  autoEatEnabled: false, autoEatFood: null, autoEatPct: 0,
  toolCarry: {}, unlockedRecipes: {}, companionXpBacked: true, away: true,
  items: ITEMS, monsters: MONSTERS, nodes: GATHER_NODES, recipes: ARTISAN_RECIPES_ALL,
};
const COMBAT_SKILLS = { attack: MAXED, strength: MAXED, defense: MAXED, hitpoints: MAXED };
const GATHER_SKILLS = { woodcutting: MAXED, mining: MAXED, fishing: MAXED, farming: MAXED };

export const UNPAID_PETS = ['wolf_pup', 'badger', 'scorpion', 'tortoise', 'whelp', 'dragonling', 'hawk'];
export const PASSIVE_PETS = ['fox', 'raccoon', 'sparrow', 'lichling'];

/* Best-in-slot from the catalogue; `rank` 1 takes the next-best weapon (the
   selftest's strictly worse arm). */
function fixtureEquipment(rank = 0) {
  const eqp = {};
  const weapons = Object.keys(ITEMS)
    .filter((id) => ITEMS[id]?.weaponType && ITEMS[id]?.atkB)
    .sort((a, b) => (ITEMS[b].atkB || 0) - (ITEMS[a].atkB || 0) || (a < b ? -1 : 1));
  if (weapons[rank]) eqp.weapon = weapons[rank];
  const best = {};
  for (const [id, it] of Object.entries(ITEMS)) {
    if (!it || it.type !== 'armor' || !it.slot) continue;
    const cur = best[it.slot];
    if (!cur || (it.tier || 0) > (ITEMS[cur].tier || 0)) best[it.slot] = id;
  }
  for (const [slot, id] of Object.entries(best)) eqp[slot === 'head' ? 'helmet' : slot] = id;
  return eqp;
}

const GATHER_NODE = Object.keys(GATHER_NODES).find((id) => computeAccrual({
  ...BASE, activeKind: 'gather', activeId: id, skills: GATHER_SKILLS, equipment: {},
  perks: { ok: true, companion: null },
}).accrued === true);

function night(kind, companion, equipment) {
  return kind === 'combat'
    ? computeAccrual({ ...BASE, activeKind: 'combat', activeId: 'goblin', skills: { ...COMBAT_SKILLS },
      equipment, perks: { ok: true, companion } })
    : computeAccrual({ ...BASE, activeKind: 'gather', activeId: GATHER_NODE, skills: { ...GATHER_SKILLS },
      equipment: {}, perks: { ok: true, companion } });
}

/** The result with the pet's own `stat companion_xp:<id>` op removed. */
function withoutXpOp(r) {
  const c = JSON.parse(JSON.stringify(r));
  if (c.delta && Array.isArray(c.delta.progress)) {
    c.delta.progress = c.delta.progress.filter((o) => !(o && o.kind === 'stat'
      && typeof o.key === 'string' && o.key.startsWith('companion_xp:')));
  }
  return JSON.stringify(c);
}

/** Pure over its equipment pair; `petEq` differs from `nullEq` only in the selftest. */
export function companionPaysParity({ nullEq = fixtureEquipment(), petEq = nullEq } = {}) {
  const problems = [];
  if (!GATHER_NODE) return ['CPP-0: no gather node accrues in 12h — the gather fixture is vacuous'];
  const xp30 = companionXpToReach(30);
  const control = { combat: night('combat', null, nullEq), gather: night('gather', null, nullEq) };
  if (!(control.combat.summary && control.combat.summary.kills > 0)) {
    problems.push('CPP-0: the null-companion goblin night landed no kills — the combat fixture is vacuous');
  }
  for (const id of UNPAID_PETS) {
    for (const xp of [0, xp30]) {
      for (const kind of ['combat', 'gather']) {
        const pet = night(kind, { id, xp }, petEq);
        if (withoutXpOp(pet) !== withoutXpOp(control[kind])) {
          problems.push(`CPP-1: ${id} at xp ${xp} changed the ${kind} night beyond its companion_xp op `
            + `(kills ${pet.summary && pet.summary.kills} vs ${control[kind].summary && control[kind].summary.kills}) — `
            + 'the engine would be paying a combat stat or proc the client no longer shows');
        }
      }
    }
  }
  for (const id of PASSIVE_PETS) {
    for (const xp of [0, xp30]) {
      const pet = night('combat', { id, xp }, petEq);
      if (!pet.summary || pet.summary.kills !== control.combat.summary.kills) {
        problems.push(`CPP-2: ${id} at xp ${xp} changed goblin kills (${pet.summary && pet.summary.kills} vs `
          + `${control.combat.summary.kills}) — a passive pet has no combat effect`);
      }
    }
  }
  return problems;
}

function selftest() {
  const planted = companionPaysParity({ nullEq: fixtureEquipment(1), petEq: fixtureEquipment(0) });
  const caught = planted.some((p) => p.startsWith('CPP-1:'));
  const clean = companionPaysParity();
  if (!caught) console.error('SELFTEST: a strictly better weapon on the pet arm was NOT caught by CPP-1');
  if (clean.length) console.error('SELFTEST: the unplanted run is red:\n  ' + clean.join('\n  '));
  if (caught && !clean.length) console.log('companion-pays-parity --selftest: planted better weapon caught by CPP-1; clean run green.');
  return caught && !clean.length;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);
  const problems = companionPaysParity();
  if (problems.length) {
    console.error('COMPANION-PAYS-PARITY FAILED:\n' + problems.map((p) => '  ✗ ' + p).join('\n'));
    process.exit(1);
  }
  console.log(`companion-pays-parity: ${UNPAID_PETS.length} combat/proc pets pay only their XP row away `
    + `(goblin + ${GATHER_NODE}, L1 and L30); ${PASSIVE_PETS.length} passive pets leave kills unchanged.`);
  process.exit(0);
}
