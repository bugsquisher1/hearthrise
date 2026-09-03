// ════════════════════════════════════════════════════════════════════════
// tests/dungeon-key-drops.mjs — THE SERVER-SIDE KEY-DROP FOLD GUARD.
//
// Increment 1 of the dungeon settlement program (docs/design/dungeon-settlement.md
// §3). The BoP dungeon keys used to be minted CLIENT-SIDE only, by a
// `setupKeyDrops` IIFE in src/dungeons.js that wrapped window.killMonster and
// called addItem — never in MONSTERS[*].drops, never in src/core/combat-sim.js,
// never settled by the accrual engine. Under src/net/capstone.js BLOB_RETIRED
// that mint was lost on every reload (the "keys vanish" P1), and keys never
// dropped on offline/away kills at all (the P2), because the away replay runs
// combat-sim.resolveKill, which never saw the wrapper.
//
// THE FOLD: each (monster → keyId, chance) below is now an ordinary BoP row in
// that monster's `drops` array in src/data/monsters.js. combat-sim.resolveKill
// rolls it via rollDropTable with the SAME seeded RNG on both live and away
// kills, the accrual engine settles it into player_inventory via hr_apply, and
// item-authority.js classifies it serverOwnedItem — so it survives the inventory
// absolute-replace flip too. No SQL: all six keys are already in the hr_items
// server catalogue, so hr_apply accepts them.
//
// THIS GUARD FAILS THE BUILD IF the fold regresses in any of six ways:
//   (1) a key drop is removed from monsters.js, or its chance drifts;
//   (2) a key appears in a monster's drops that is NOT in the frozen map, or at
//       the wrong rate (a stray / mis-rated key);
//   (3) a client-side key mint (the killMonster wrapper) is re-introduced in
//       src/dungeons.js — which would DOUBLE the live drop and DIVERGE from the
//       away path (accrual never calls the wrapper), an AWAY-1 parity break;
//   (4) a key stops classifying serverOwnedItem (the settle-ability + flip-safety
//       property the whole fold buys);
//   (5) the no-multiplier drop chance is not exactly the declared rate;
//   (6) resolveKill produces a DIFFERENT key outcome for a "live" ctx vs an
//       "away" ctx at the same seed (the AWAY-1 property, applied to keys).
//
// FROZEN MAP = the exact former KEY_DROPS table (src/dungeons.js, pre-fold). It
// is the contract; changing a rate is a deliberate edit here AND in monsters.js,
// reviewed together. Pure ESM + source read. No DB, no browser. Standalone:
//   node tests/dungeon-key-drops.mjs
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MONSTERS } from '../src/data/monsters.js';
import { ITEMS } from '../src/data/items.js';
import { serverOwnedItem, rebuildItemAuthority } from '../src/data/item-authority.js';
import { resolveKill } from '../src/core/combat-sim.js';
import { effectiveDropChance } from '../src/core/drops.js';
import { createRng } from '../src/core/rng.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

// ── THE FROZEN CONTRACT: the former KEY_DROPS table, verbatim. Each row is
//    (monster → { keyId, chance }). This is what monsters.js MUST carry as a
//    BoP drop row, and NOTHING ELSE may carry a key row. ─────────────────────
const FROZEN_KEY_DROPS = {
  // Crypt of Bones — undead family
  weak_skeleton:   { keyId: 'bone_key',        chance: 0.025 },
  skeleton:        { keyId: 'bone_key',        chance: 0.04  },
  zombie:          { keyId: 'bone_key',        chance: 0.05  },
  // Goblin Warcamp — goblinoid family
  goblin:          { keyId: 'goblin_seal',     chance: 0.02  },
  hobgoblin:       { keyId: 'goblin_seal',     chance: 0.04  },
  goblin_brute:    { keyId: 'goblin_seal',     chance: 0.06  },
  goblin_warlord:  { keyId: 'goblin_seal',     chance: 0.10  },
  // Haunted Archive — magic users
  dark_wizard:     { keyId: 'arcane_tome',     chance: 0.04  },
  warlock:         { keyId: 'arcane_tome',     chance: 0.06  },
  archmage:        { keyId: 'arcane_tome',     chance: 0.10  },
  // Obsidian Keep — heavy infantry / death-tier
  death_knight:    { keyId: 'obsidian_sigil',  chance: 0.05  },
  warband_captain: { keyId: 'obsidian_sigil',  chance: 0.07  },
  // Voidbringer — void/plague tier
  plague_swarm:    { keyId: 'void_fragment',   chance: 0.05  },
  void_parasite:   { keyId: 'void_fragment',   chance: 0.10  },
  // Ancient Wyrm — only the dragon itself
  dragon:          { keyId: 'dragonsbane_key', chance: 0.30  },
};

const KEY_IDS = ['bone_key', 'goblin_seal', 'arcane_tome', 'obsidian_sigil', 'void_fragment', 'dragonsbane_key'];
const EPS = 1e-9;

/** Every key drop row present on a monster, from the live data. */
function observedKeyDropsOf(id) {
  const drops = (MONSTERS[id] && MONSTERS[id].drops) || [];
  return drops.filter((d) => d && KEY_IDS.includes(d.id));
}

/** Is `id` a key item per the data? tag:'key' is the authored marker. */
function isKeyItem(id) {
  return KEY_IDS.includes(id) || (ITEMS[id] && ITEMS[id].tag === 'key');
}

/** One deterministic kill; returns the map of dropped item ids → qty. `fx`
 *  is the effect surface — a rich ("live") one vs a minimal ("away") one. */
function killDrops(monsterId, seed, fx) {
  const m = MONSTERS[monsterId];
  const state = { activeMonster: monsterId, gold: 0, stats: {}, combatKillsThisFoe: 0 };
  const captured = {};
  const sink = Object.assign({ addItem: (iid, n) => { captured[iid] = (captured[iid] || 0) + (n || 0); } }, fx);
  resolveKill(state, m, {
    rng: createRng(seed),
    bonus: () => 0,             // no perks — the honest base rate
    weakness: () => ({ dropMult: 1 }),
    botd: null,                 // → NO_BONUS
    style: undefined,           // killXpRoute tolerates this
    fx: sink,
  });
  return captured;
}

// A "live" fx surface (all the handlers the client wires) vs an "away" one
// (accrual runs silent). Neither influences DROP resolution — that is the
// property under test. addItem is added by killDrops so both capture.
const LIVE_FX = {
  onLoot: () => {}, onDrop: () => {}, onKill: () => {}, recordKill: () => {},
  rollKillDeed: () => {}, addXp: () => {}, updateDaily: () => {},
  updateQuest: () => {}, handleBountyKill: () => {},
};
const AWAY_FX = {};   // minimal — every missing handler is a no-op by design

export async function dungeonKeyDropsGuard() {
  const problems = [];
  const fail = (m) => problems.push('dungeon-key-drops: ' + m);

  // ── (1) FOLD COMPLETENESS: every frozen mapping is a real drop row. ────────
  for (const [monsterId, spec] of Object.entries(FROZEN_KEY_DROPS)) {
    if (!MONSTERS[monsterId]) {
      fail(`monster "${monsterId}" no longer exists, but the fold expects it to drop ${spec.keyId} — a dungeon is now unreachable`);
      continue;
    }
    const rows = observedKeyDropsOf(monsterId).filter((d) => d.id === spec.keyId);
    if (rows.length === 0) {
      fail(`${monsterId} no longer drops ${spec.keyId} — the key-drop fold regressed (add `
        + `{ id: '${spec.keyId}', ch: ${spec.chance} } back to its drops in src/data/monsters.js, `
        + `or the key can never be earned again and the dungeon is unreachable)`);
      continue;
    }
    if (rows.length > 1) {
      fail(`${monsterId} has ${rows.length} '${spec.keyId}' drop rows — duplicate key row, which double-rolls the key`);
    }
    if (Math.abs((rows[0].ch || 0) - spec.chance) > EPS) {
      fail(`${monsterId} drops ${spec.keyId} at ch=${rows[0].ch}, but the frozen contract is ${spec.chance}. `
        + `If this rate change is intentional, update FROZEN_KEY_DROPS here AND monsters.js together (a reviewed edit).`);
    }
  }

  // ── (2) NO STRAY / MIS-RATED KEY: every key row in the WHOLE roster maps to
  //        a frozen entry for that exact monster + rate. Catches a key added to
  //        an unexpected monster, or at a rate the contract does not name. ─────
  for (const monsterId of Object.keys(MONSTERS)) {
    for (const row of observedKeyDropsOf(monsterId)) {
      const spec = FROZEN_KEY_DROPS[monsterId];
      if (!spec || spec.keyId !== row.id) {
        fail(`${monsterId} drops key "${row.id}" (ch=${row.ch}) with no frozen-contract entry — a stray key drop. `
          + `Add it to FROZEN_KEY_DROPS (a reviewed rate) or remove it from monsters.js.`);
      }
    }
  }

  // ── (3) NO CLIENT-SIDE KEY MINT: the killMonster wrapper must stay deleted.
  //        COMMENTS ARE STRIPPED before the scan — the pointer comment left in
  //        dungeons.js legitimately names the retired symbols for a human reader;
  //        only re-introduced CODE is a regression. ────────────────────────────
  let dungeonsSrc = '';
  try {
    dungeonsSrc = await readFile(join(ROOT, 'src', 'dungeons.js'), 'utf8');
  } catch (e) {
    fail('could not read src/dungeons.js — cannot verify the client key mint is gone: ' + (e && e.message));
  }
  const codeOnly = dungeonsSrc
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (skip :// in urls)
  for (const banned of ['setupKeyDrops', 'trySpawnKeyDrop', 'hookKillMonster', '__keyDropsHooked', 'KEY_DROPS']) {
    if (codeOnly.includes(banned)) {
      fail(`src/dungeons.js still has CODE referencing "${banned}" — the client-side key mint (the `
        + `killMonster wrapper) is back. It DOUBLES the live drop (m.drops + wrapper) and DIVERGES from `
        + `the away path (accrual never calls the wrapper): an AWAY-1 parity break. Keys drop via monsters.js now.`);
    }
  }

  // ── (4) SERVER-OWNED: the fold's payoff — keys settle + survive the flip. ───
  rebuildItemAuthority();   // fresh partition over the current monsters.js
  for (const keyId of KEY_IDS) {
    if (!serverOwnedItem(keyId)) {
      fail(`serverOwnedItem('${keyId}') is false — the key is not classified server-owned, so the accrual `
        + `envelope will not settle it and the inventory flip could delete it. It must be a combat drop `
        + `(in some monster's m.drops) and NOT in the excluded set (dungeon LOOT / boss signatures).`);
    }
  }

  // ── (5) RATE IDENTITY: with no multipliers, the drop chance IS the declared
  //        rate — so the fold preserves the former flat KEY_DROPS rate exactly. ─
  for (const [, spec] of Object.entries(FROZEN_KEY_DROPS)) {
    const eff = effectiveDropChance({ id: spec.keyId, ch: spec.chance }, {});
    if (Math.abs(eff - spec.chance) > EPS) {
      fail(`effectiveDropChance for ${spec.keyId} at base is ${eff}, expected ${spec.chance} — the fold `
        + `changed the unbuffed key rate.`);
    }
  }

  // ── (6) AWAY-1 PARITY, applied to keys: resolveKill is ctx-blind for drops,
  //        so a "live" fx and an "away" fx at the SAME seed produce identical
  //        drops — INCLUDING the key. Proven on a seed where the key actually
  //        drops (so the assertion is about the key, not about an empty run). ──
  const PARITY_SAMPLES = [
    ['dragon', 'dragonsbane_key'],       // high-rate band
    ['weak_skeleton', 'bone_key'],       // low-rate band (0.025)
    ['warband_captain', 'obsidian_sigil'],
  ];
  for (const [monsterId, keyId] of PARITY_SAMPLES) {
    if (!MONSTERS[monsterId]) continue;   // (1) already reported it
    let proved = false;
    for (let seed = 1; seed <= 20000 && !proved; seed++) {
      const live = killDrops(monsterId, seed, LIVE_FX);
      if (!live[keyId]) continue;         // find a seed where the key drops
      const away = killDrops(monsterId, seed, AWAY_FX);
      const liveJson = JSON.stringify(live, Object.keys(live).sort());
      const awayJson = JSON.stringify(away, Object.keys(away).sort());
      if (liveJson !== awayJson) {
        fail(`AWAY parity BROKEN for ${monsterId} @ seed ${seed}: live drops ${liveJson} != away drops ${awayJson}. `
          + `A seeded kill must be byte-identical live vs away — this is the AWAY-1 property.`);
      } else if (!away[keyId]) {
        fail(`AWAY parity: ${monsterId} dropped ${keyId} live but NOT away @ seed ${seed} — the key does not `
          + `settle on offline/away kills, which is the P2 finding this fold closes.`);
      }
      proved = true;
    }
    if (!proved) {
      fail(`could not find a seed in 20000 tries where ${monsterId} drops ${keyId} — either the drop row is `
        + `missing (see (1)) or the rate is far below the frozen contract.`);
    }
  }

  return problems;
}

// Standalone runner.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  dungeonKeyDropsGuard().then((problems) => {
    if (problems.length) {
      console.log('Dungeon key-drop fold — FAILED:');
      for (const p of problems) console.log('  x ' + p);
      process.exit(1);
    }
    console.log('Dungeon key-drop fold — OK: 15 key drops folded into monsters.js at the frozen rates, '
      + 'no client-side key mint, all 6 keys serverOwnedItem, base rate preserved, AWAY-1 parity holds for keys.');
  });
}
