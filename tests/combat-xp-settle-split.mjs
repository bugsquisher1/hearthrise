#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/combat-xp-settle-split.mjs — the SETTLE half of the combat-XP fix.
//
// hr_credit_combat_xp credits ATTENDED combat XP and advances the watermark
// player_state.combat_xp_accrued_to. The away/span-sim (accrual.js) must then NOT
// re-credit combat XP the live credit already paid: it credits combat XP only for
// the window at/after that watermark (max(fromMs, combat_xp_accrued_to)). This
// guard proves that property AND the AWAY-1-preserving one — with no watermark
// (or a stale one below the settle's fromMs) the combat-XP delta is byte-identical
// to the pre-split behaviour, and LOOT/GOLD is unchanged in every case.
//
// Run standalone:  node tests/combat-xp-settle-split.mjs
// ════════════════════════════════════════════════════════════════════════
import { fileURLToPath } from 'node:url';
import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';

const MONSTER = MONSTERS.goblin ? 'goblin' : Object.keys(MONSTERS)[0];
// Auto-eat with a deep food stack so the maxed character SURVIVES the whole 12h
// span and keeps earning XP past the mid watermark — otherwise a death before the
// watermark would make "mid credits nothing" a true-but-uninteresting pass.
const FOOD = ITEMS.cooked_shark ? 'cooked_shark' : Object.keys(ITEMS).find((k) => ITEMS[k] && ITEMS[k].foodClass === 'healing');
const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);   // crosses one UTC midnight
const SPAN_MS = 12 * 3600000;
const NOW_MS = FROM_MS + SPAN_MS;
const MID_MS = FROM_MS + 6 * 3600000;
const SEED = 0x5eed1234;
const MAXED = {
  attack: 13034431, strength: 13034431, defense: 13034431, hitpoints: 13034431,
  ranged: 13034431, magic: 13034431, prayer: 13034431,
};
const EQUIPMENT = (() => {
  const eqp = {};
  const weapon = Object.keys(ITEMS)
    .filter((id) => ITEMS[id]?.weaponType && ITEMS[id]?.atkB)
    .sort((a, b) => (ITEMS[b].atkB || 0) - (ITEMS[a].atkB || 0))[0];
  if (weapon) eqp.weapon = weapon;
  const best = {};
  for (const [id, it] of Object.entries(ITEMS)) {
    if (!it || it.type !== 'armor' || !it.slot) continue;
    const cur = best[it.slot];
    if (!cur || (it.tier || 0) > (ITEMS[cur].tier || 0)) best[it.slot] = id;
  }
  for (const [slot, id] of Object.entries(best)) eqp[slot === 'head' ? 'helmet' : slot] = id;
  return eqp;
})();

function run(over) {
  return computeAccrual({
    userId: '00000000-0000-4000-8000-000000000009',
    slot: 0, nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
    activeKind: 'combat', activeId: MONSTER, capMs: SPAN_MS, seed: SEED,
    hp: 99, maxHp: 99, gold: 0, skills: { ...MAXED },
    equipment: EQUIPMENT, items: ITEMS, monsters: MONSTERS,
    autoEatEnabled: true, autoEatFood: FOOD, autoEatPct: 50,
    inventory: { [FOOD]: 500000 },
    ...over,
  });
}
const xpOf = (r) => (r && r.accrued && r.delta && r.delta.xp) ? r.delta.xp : {};
const sumXp = (xp) => Object.values(xp).reduce((a, b) => a + b, 0);
const goldOf = (r) => (r && r.accrued && r.delta && Number(r.delta.gold)) || 0;

export async function combatXpSettleSplitGuard() {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };

  // BASELINE: no watermark (a database without the column, or genuinely away).
  const base = run({});
  const baseXp = xpOf(base);
  ok(base.accrued, 'baseline combat accrual did not accrue');
  ok(sumXp(baseXp) > 0, 'baseline produced no combat XP — fixture is not exercising the path');

  // STALE watermark BELOW fromMs → byte-identical to baseline (AWAY-1 property).
  const stale = run({ combatXpAccruedToMs: FROM_MS - 3600000 });
  const staleXp = xpOf(stale);
  for (const k of new Set([...Object.keys(baseXp), ...Object.keys(staleXp)])) {
    ok(baseXp[k] === staleXp[k], `stale-watermark XP diverged from baseline on ${k}: ${staleXp[k]} vs ${baseXp[k]}`);
  }
  ok(goldOf(stale) === goldOf(base), 'stale watermark changed the gold/loot delta — loot window must be unchanged');

  // MID watermark → only the [mid, now] portion of combat XP; loot unchanged.
  const mid = run({ combatXpAccruedToMs: MID_MS });
  const midXp = xpOf(mid);
  ok(sumXp(midXp) > 0, 'mid-watermark credited no combat XP (should credit the second half)');
  ok(sumXp(midXp) < sumXp(baseXp), 'mid-watermark did not REDUCE combat XP — the split is not applied');
  for (const k of Object.keys(midXp)) {
    ok(midXp[k] <= (baseXp[k] || 0), `mid-watermark XP on ${k} exceeds the full-window XP — split is wrong`);
  }
  ok(goldOf(mid) === goldOf(base), 'mid watermark changed the gold/loot delta — only combat XP may be split');

  // FULLY-COVERED watermark at now → zero combat XP, loot still paid.
  const full = run({ combatXpAccruedToMs: NOW_MS });
  ok(sumXp(xpOf(full)) === 0, `fully-covered watermark still credited combat XP: ${JSON.stringify(xpOf(full))}`);
  ok(goldOf(full) === goldOf(base), 'fully-covered watermark changed the gold/loot delta — loot must still pay away');

  if (problems.length) {
    const e = new Error('combat-xp settle-split:\n  - ' + problems.join('\n  - '));
    e.problems = problems;
    throw e;
  }
  return { ok: true, checks: 'settle credits combat XP only past the watermark; loot unchanged; AWAY-1 preserved' };
}

if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')
    || process.argv[1] === fileURLToPath(import.meta.url)) {
  combatXpSettleSplitGuard().then((r) => { console.log(r.checks); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
