// ════════════════════════════════════════════════════════════════════════
// src/core/personal-loot.js — PERSONAL LOOT'S CHANCE AND PITY (systems, lane/flame-temper-build, 2026-11-22; 21-flame-temper-imbue-loot.md
// section 4; the levers are src/data/party.js PERSONAL_LOOT).
//
// THE SPLIT OF OWNERSHIP (21 section 4.8, the brief): the drop ROLLER is lane/drop-formula's (04 section 10, wave 4); this file owns only
// the two inputs it takes per hero, so personal loot and pity run on that one roller: the hero's share of a row (ch / n) with its
// company's flame luck (src/core/inner-flame.js luckPm), and the pity on top. The server keeps each hero's pity in hero_pity (its own
// settle write); the SQL twins of these three functions are in supabase/migrations/1063-flame-temper-catalogue.generated.sql, pinned there.
// THE ONE PITY (designer, lane/designer-pity, 2026-11-26; 12-targets 8.6): src/core/trait-roll.js rollKillFor reads pityChance and writes
// pityAfter, so the roller, hero_pity and the twins hold one model.
// Order on a Rare roll: the row's chance, / n, x depth (the roller's), x (1 + luck), then pity. A guarantee (ch >= 1) is never scaled up.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random: the roller draws on the server-only loot stream, seeded per hero.
// ════════════════════════════════════════════════════════════════════════
import { PERSONAL_LOOT, PITY_UNIT } from '../data/party.js';

const P = PERSONAL_LOOT;
const UNIT = PITY_UNIT;

/** A hero's chance on one row at a kill with `n` heroes alive at it, its company's flame at `luck` permille (luck reads only on a Rare row). */
export function heroChance(ch, n, luck) {
  const c = Number(ch), k = Math.max(1, Math.floor(Number(n) || 1)), l = Math.max(0, Math.floor(Number(luck) || 0));
  if (!(c > 0)) return 0;
  return Math.min(1, (c / k) * ((1000 + l) / 1000));
}

/** The chance a hero rolls a Rare at, `p` its stated chance (heroChance x depth), `missed` its hero_pity row (x in PITY_UNIT parts). */
export function pityChance(p, missed) {
  const pr = Number(p);
  if (!(pr > 0)) return 0;
  const p0 = (pr * P.pityBasePm) / 1000, x = Math.max(0, Math.floor(Number(missed) || 0)) / UNIT;
  return Math.min(1, p0 * (1 + (P.pityGrowPm / 1000) * x));
}

/** The hero_pity row after one roll at stated chance `p`: 0 on a find, else the miss's p0 added (whole PITY_UNIT parts, rounded once). */
export function pityAfter(missed, p, hit) {
  if (hit) return 0;
  const pr = Number(p);
  return Math.max(0, Math.floor(Number(missed) || 0)) + (pr > 0 ? Math.round(((pr * P.pityBasePm) / 1000) * UNIT) : 0);
}
