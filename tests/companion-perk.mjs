// ════════════════════════════════════════════════════════════════════════
// tests/companion-perk.mjs — THE EQUIPPED COMPANION'S PASSIVE BONUS, proven
// server-owned, level-scaled, and byte-parity-safe (away == live).
//
// This is the AWAY-1 obligation for the companion channel: a seeded fight with
// a companion equipped must score BYTE-IDENTICAL whether it is replayed live or
// away. The passive bonus is a draw-free, permanent-scope layer, so it moves no
// seeded roll — away and live share every draw. It also proves the bonus is a
// SEPARATE additive layer on top of the fused layer 0 (not folded into it), and
// that the level formula in src/core/companion-perk.js matches the client's.
//
// Two pets carry two distinct claims:
//   · fox (allXP)      — the layer IS APPLIED: XP lifts vs no companion, and
//                        scales with level. allXP feeds grantXp only, not a
//                        combat draw, so it lifts the reward without a fixture
//                        that has to survive a stronger monster.
//   · raccoon (goldFind) — the layer PERTURBS NO DRAW: goldFind touches only the
//                        gold multiplier, so kills and XP are IDENTICAL to the
//                        no-companion run. (Its per-kill gold floor can hide the
//                        gold delta on a low-gp monster; that is a rounding fact
//                        about applyGoldFind, not the layer, so this test asserts
//                        the invariant it can prove cleanly: no draw is moved.)
//
// Run: node tests/companion-perk.mjs   (exit 0 = green)
// ════════════════════════════════════════════════════════════════════════

import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import {
  companionKeyBonus, companionXpToReach, companionLevelFromXp,
  COMPANION_KEYS, COMPANION_MAX_LEVEL,
} from '../src/core/companion-perk.js';
import { pathToFileURL } from 'node:url';
import { COMPANIONS } from '../src/data/companions.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';

// Best-in-slot from the LIVE catalogue (the accrual-engine harness's own
// pickEquipment) so the fixture actually kills — an invented item would test the
// engine against data the game does not contain.
function pickEquipment() {
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
}
const EQUIPMENT = pickEquipment();
const SKILLS = { attack: 30000, strength: 28000, defense: 22000, hitpoints: 26000, ranged: 1000, magic: 1000, prayer: 500 };
const MONSTER = Object.keys(MONSTERS).includes('goblin') ? 'goblin' : Object.keys(MONSTERS)[0];
const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);
const NOW_MS = FROM_MS + 12 * 3600000;

function run(perks, away = true) {
  return computeAccrual({
    userId: '00000000-0000-4000-8000-0000000000c0', slot: 0,
    nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
    activeKind: 'combat', activeId: MONSTER, capMs: 12 * 3600000,
    seed: 0x5eed1234, hp: 99, maxHp: 99, gold: 1000,
    skills: SKILLS, equipment: EQUIPMENT, items: ITEMS, monsters: MONSTERS,
    perks, away,
  });
}
const totalXp = (s) => Object.values(s.summary.xp || {}).reduce((a, b) => a + b, 0);

/**
 * The companion perk-channel guard. Returns an array of problem strings (empty
 * = green), matching accrual-engine.mjs runAll / perk-channel.mjs
 * perkChannelGuard so run-smoke.mjs can collect and report it with the rest.
 */
export function companionPerkGuard() {
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const eqJson = (a, b, msg) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) problems.push(`${msg}\n      A: ${A}\n      B: ${B}`);
};

// ── 1. THE LEVEL FORMULA MATCHES THE CLIENT (drift guard) ───────────────────
// src/features/companions.js is a classic-ish feature module (imports the event
// bus + window) so it cannot be imported here; its curve is restated in
// companion-perk.js. These anchors are the client's own documented values — the
// cap is 792,783 XP to reach L30 (companions.js b228 header). If the restated
// formula drifts, an equipped pet pays a different magnitude on each side.
ok(companionXpToReach(1) === 0, 'L1 must need 0 xp');
ok(companionXpToReach(30) === 792783,
  `companionXpToReach(30) = ${companionXpToReach(30)}, expected 792783 (the client's cap) — the level curve drifted`);
ok(companionLevelFromXp(0) === 1, 'xp 0 → level 1');
ok(companionLevelFromXp(792783) === 30, 'the cap xp → level 30');
ok(companionLevelFromXp(-5) === 1 && companionLevelFromXp(NaN) === 1, 'garbage xp → level 1, never a throw');
ok(COMPANION_MAX_LEVEL === 30, 'max level 30');

// ── 2. THE MAGNITUDE + SCALE, and the projected-key surface ─────────────────
eqJson(Number(companionKeyBonus('goldFind', { id: 'raccoon', xp: 0 }).toFixed(6)), 0.01,
  'raccoon goldFind at L1 must be exactly the base 0.01');
eqJson(Number(companionKeyBonus('goldFind', { id: 'raccoon', xp: companionXpToReach(30) }).toFixed(6)), 0.0245,
  'raccoon goldFind at L30 must be 0.0245 (×2.45)');
ok(companionKeyBonus('strB', { id: 'fox', xp: 0 }) === 0, 'strB (a combat stat) must not project through the bonus vector');
ok(companionKeyBonus('crit', { id: 'whelp', xp: 0 }) === 0, 'crit (a combat stat) must not project through the bonus vector');
ok(companionKeyBonus('goldFind', { id: 'constructor', xp: 0 }) === 0, 'a forged id "constructor" must pay nothing, never NaN');
for (const k of COMPANION_KEYS) {
  const anyPays = Object.values(COMPANIONS).some((d) => d.bonus && Object.prototype.hasOwnProperty.call(d.bonus, k));
  ok(anyPays, `COMPANION_KEYS lists "${k}" but no companion pays it — the projected set drifted from the data`);
}

// ── 3. AWAY == LIVE, BYTE-IDENTICAL, WITH A COMPANION EQUIPPED ──────────────
// The AWAY-1 obligation for this channel. The WHOLE summary must match.
const none = run({ ok: true, companion: null });
const fox = run({ ok: true, companion: { id: 'fox', xp: 0 } });
const foxLive = run({ ok: true, companion: { id: 'fox', xp: 0 } }, false);
ok(fox.accrued === true, `fox accrual did not run (${fox.reason})`);
ok(none.summary.kills > 100, `COVERAGE: the fixture made only ${none.summary.kills} kills — parity of a trivial path proves nothing`);
eqJson(fox.summary, foxLive.summary,
  'AWAY-1(companion): the summary differs between away and live with fox equipped — the passive '
  + 'bonus must draw no rng and pay on the permanent channel');

// ── 4. THE LAYER IS APPLIED — fox (allXP) lifts XP vs no companion ──────────
ok(totalXp(fox) > totalXp(none),
  `fox (allXP) equipped did not raise XP: ${totalXp(fox)} vs ${totalXp(none)} — the layer is not being applied`);

// ── 5. LEVEL SCALING REACHES THE SIM — a maxed pet pays more than L1 ────────
const foxMax = run({ ok: true, companion: { id: 'fox', xp: companionXpToReach(30) } });
ok(totalXp(foxMax) > totalXp(fox),
  `a level-30 fox did not out-pay a level-1 fox: ${totalXp(foxMax)} vs ${totalXp(fox)} — level scaling is not reaching the sim`);

// ── 6. THE LAYER PERTURBS NO DRAW — raccoon (goldFind) leaves kills+XP alone
const rac = run({ ok: true, companion: { id: 'raccoon', xp: 0 } });
eqJson(rac.summary.kills, none.summary.kills, 'a goldFind pet changed the kill count — it perturbed the seeded draw order');
eqJson(rac.summary.xp, none.summary.xp, 'a goldFind pet changed XP — it perturbed the seeded draw order');

// ── 7. NULL / ABSENT COMPANION DEGRADES TO PRE-COMPANION BEHAVIOUR ──────────
for (const p of [undefined, null, {}, { ok: true }, { ok: true, companion: null }]) {
  const r = run(p);
  eqJson(r.summary.xp, none.summary.xp,
    `an absent/empty companion (${JSON.stringify(p)}) changed XP — the degrade path is not inert`);
}

  if (!problems.length) {
    console.log(`Companion perk channel — level curve matches the client (L30 = 792,783 xp), fox (allXP) `
      + `lifts XP ${totalXp(none)}→${totalXp(fox)} and scales to ${totalXp(foxMax)} at L30, raccoon `
      + `(goldFind) perturbs no draw, and a seeded fight with a companion is BYTE-IDENTICAL away vs live `
      + `(${none.summary.kills} kills). Combat stats + procs deferred; degrade path inert.`);
  }
  return problems;
}

// Self-run when invoked directly; imported by run-smoke.mjs otherwise.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const problems = companionPerkGuard();
  if (problems.length) {
    console.error('COMPANION-PERK FAILED:\n' + problems.map((p) => '  ✗ ' + p).join('\n'));
    process.exit(1);
  }
  process.exit(0);
}
