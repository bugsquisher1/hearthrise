// ════════════════════════════════════════════════════════════════════════
// tests/companion-xp.mjs — THE COMPANION XP RULE, AND THE ENGINE WRITER'S
// DELETION.
//
// Lane C2 (the closed rebuild, 2026-10-14) deleted companion XP from hr-accrue
// outright with the charm / Boss-of-the-Day multipliers. What is left to pin:
//   §2-3  the per-action rule in src/core/companion-xp.js (still the one
//         definition; progress-coalesce reads it), integer and clamped under
//         hr_apply's progress ceiling;
//   §4    no hunt, gather or bench night — attended or away, with the old arm
//         input set — proposes a companion_xp op or companion_xp_frac.
// History: b550 armed the writer after "the pets are still not getting exp";
// the wipe removes the levelled pet with it (client half: D1/R1).
//
// The engine runs for real (computeAccrual over the live catalogue); the
// per-action matrix is restated and PINNED here so a change to
// companionActionXp is a deliberate, reviewed edit.
//
// Run: node tests/companion-xp.mjs   (exit 0 = green)
// Also invoked as a preflight by tests/run-smoke.mjs.
// ════════════════════════════════════════════════════════════════════════

import { pathToFileURL } from 'node:url';

import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import { onTrainingHunt } from './hunt-fixture.mjs';
/* Lane C2: combat accrues only on a hunt session — the fixture runs as a training hunt. */
const computeAccrualOnHunt = (inp) => computeAccrual(onTrainingHunt(inp));
import { GATHER_NODES, ARTISAN_RECIPES_ALL } from '../supabase/functions/hr-accrue/catalogue.js';
import {
  companionActionXp, companionSpanXp, COMPANION_XP_CAP,
} from '../src/core/companion-xp.js';
import { companionXpToReach } from '../src/core/companion-perk.js';
import { benchPayable } from '../src/core/artisan-sim.js';
import { COMPANIONS } from '../src/data/companions.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';

const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);
const NOW_MS = FROM_MS + 12 * 3600000;
const SEED = 0x5eed1234;
const MAXED = 13034431;   // level 99

// Best-in-slot so a combat fixture actually kills (the companion-perk harness's
// own picker, chosen FROM the catalogue so a rename cannot silently zero it).
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

const BASE = {
  userId: '00000000-0000-4000-8000-0000000000cc', slot: 0,
  nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
  capMs: 12 * 3600000, seed: SEED, hp: 990, maxHp: 990, gold: 0,
  autoEatEnabled: false, autoEatFood: null, autoEatPct: 0,
  toolCarry: {}, unlockedRecipes: {},
  items: ITEMS, monsters: MONSTERS, nodes: GATHER_NODES, recipes: ARTISAN_RECIPES_ALL,
};

const COMBAT_SKILLS = { attack: MAXED, strength: MAXED, defense: MAXED, hitpoints: MAXED };
const MONSTER = Object.keys(MONSTERS).includes('goblin') ? 'goblin' : Object.keys(MONSTERS)[0];

function runCombat(companion, backed, away = true) {
  return computeAccrualOnHunt({
    ...BASE, activeKind: 'combat', activeId: MONSTER, skills: { ...COMBAT_SKILLS },
    equipment: EQUIPMENT, perks: companion ? { ok: true, companion } : { ok: true, companion: null },
    companionXpBacked: backed, away,
  });
}

/** The single companion_xp op in a delta, or undefined. */
const compOp = (r) => (r && r.delta && r.delta.progress || [])
  .find((o) => o && typeof o.key === 'string' && o.key.startsWith('companion_xp:'));

export function companionXpGuard() {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };

  /* §1 (the arm switch pinned true) is RETIRED with the engine writer — lane
     C2 deleted companion XP from hr-accrue outright (5aeb6190; the closed
     rebuild). §4 below now pins the deletion. The client still imports
     COMPANION_XP_SERVER_BACKED (src/features/companions.js); retiring that
     flag and the client's level copy is the D1/R1 client half. */

  // ── 2. THE PER-ACTION MATRIX IS companionActionXp ─────────────────────────
  // A dedicated pet earns 1, a utility/hybrid pet 0.5, a mismatched pet 0.
  const MATRIX = [
    ['combat', 'combat-kill', 1], ['combat', 'gather', 0], ['combat', 'artisan', 0],
    ['gather', 'gather', 1], ['gather', 'combat-kill', 0], ['gather', 'artisan', 0],
    ['artisan', 'artisan', 1], ['artisan', 'gather', 0], ['artisan', 'combat-kill', 0],
    ['utility', 'combat-kill', 0.5], ['utility', 'gather', 0.5], ['utility', 'artisan', 0.5],
    ['hybrid', 'combat-kill', 0.5], ['hybrid', 'gather', 0.5], ['hybrid', 'artisan', 0.5],
  ];
  for (const [role, act, want] of MATRIX) {
    ok(companionActionXp(role, act) === want,
      `companion-xp: companionActionXp(${role}, ${act}) = ${companionActionXp(role, act)}, expected ${want} — the per-action matrix drifted`);
  }
  ok(companionActionXp(null, 'combat-kill') === 0 && companionActionXp('combat', null) === 0,
    'companion-xp: a null role or activity must earn 0, never throw');

  // ── 3. companionSpanXp — INTEGER, CLAMPED, MISMATCH-SAFE ─────────────────
  ok(companionSpanXp({ companionId: 'wolf_pup', currentXp: 0, activityType: 'combat-kill', actionCount: 40 }) === 40,
    'companion-xp: a combat pet over 40 kills should earn 40 (1/kill)');
  ok(companionSpanXp({ companionId: 'fox', currentXp: 0, activityType: 'combat-kill', actionCount: 41 }) === 20,
    'companion-xp: a utility pet over 41 kills should earn floor(0.5*41)=20');
  ok(companionSpanXp({ companionId: 'wolf_pup', currentXp: 0, activityType: 'gather', actionCount: 999 }) === 0,
    'companion-xp: a combat pet earns 0 from gather actions');
  ok(companionSpanXp({ companionId: 'constructor', currentXp: 0, activityType: 'combat-kill', actionCount: 10 }) === 0,
    'companion-xp: a forged id "constructor" must earn 0, never NaN');
  ok(companionSpanXp({ companionId: 'wolf_pup', currentXp: COMPANION_XP_CAP - 5, activityType: 'combat-kill', actionCount: 40 }) === 5,
    'companion-xp: the grant must clamp to the remaining headroom under the cap');
  ok(companionSpanXp({ companionId: 'wolf_pup', currentXp: COMPANION_XP_CAP, activityType: 'combat-kill', actionCount: 40 }) === 0,
    'companion-xp: a capped pet earns nothing more');
  ok(COMPANION_XP_CAP === companionXpToReach(30),
    'companion-xp: the cap must be the shared curve at L30');
  /* THE OP CAN NEVER TRIP hr_apply's PROGRESS CEILING. hr_apply rejects the
     WHOLE delta with `progress_clamp` when any op's `add` exceeds
     c_max_progress_add (1,000,000 — 2026-08-11-apply-engine.sql and every
     restatement since). companionSpanXp clamps to the headroom under
     COMPANION_XP_CAP, so the largest grant it can ever return is the cap itself.
     If someone raises the curve past the ceiling, a single long away night would
     lose the player EVERYTHING in the delta, not just the pet XP — so the
     relationship is pinned here rather than discovered live. */
  const HR_APPLY_MAX_PROGRESS_ADD = 1000000;
  ok(COMPANION_XP_CAP <= HR_APPLY_MAX_PROGRESS_ADD,
    `companion-xp: COMPANION_XP_CAP (${COMPANION_XP_CAP}) exceeds hr_apply's c_max_progress_add `
    + `(${HR_APPLY_MAX_PROGRESS_ADD}) — a max-headroom grant would be rejected as progress_clamp and `
    + 'take the whole delta down with it');
  ok(companionSpanXp({ companionId: 'wolf_pup', currentXp: 0, activityType: 'combat-kill', actionCount: 10 ** 9 })
       <= HR_APPLY_MAX_PROGRESS_ADD,
    'companion-xp: an absurd action count must still clamp under the hr_apply progress ceiling');

  // ── 4. THE ENGINE WRITES NO COMPANION XP (lane C2, deleted outright) ──
  /* Not a dormancy claim: there is no writer and no arm. A hunt (combat), a
     gather night and a bench night, each with a role-matched pet equipped and
     the old arm input set, must carry NO companion_xp op and NO
     companion_xp_frac key — a writer that crept back would mint a stat the
     wipe deleted, unreviewed. Both paths (attended and away) are asserted. */
  const gatherNode = Object.keys(GATHER_NODES).find((id) => {
    const r = computeAccrual({
      ...BASE, activeKind: 'gather', activeId: id,
      skills: { woodcutting: MAXED, mining: MAXED, fishing: MAXED, farming: MAXED },
      equipment: {}, perks: { ok: true, companion: { id: 'sparrow', xp: 0 } }, companionXpBacked: true,
    });
    return r.accrued === true;
  });
  ok(gatherNode, 'companion-xp: no gather node accrued in 12h — cannot exercise the gather path');
  const recipeId = Object.entries(ARTISAN_RECIPES_ALL).find(([, e]) => {
    const rc = e && e.recipe;
    return e && e.skill && benchPayable(e.skill) && rc && !rc.gated && (rc.inputs || rc.input);
  })?.[0];
  ok(recipeId, 'companion-xp: no payable ungated recipe found — cannot exercise the bench path');
  const nights = [];
  for (const away of [false, true]) {
    nights.push(['combat (hunt)', runCombat({ id: 'wolf_pup', xp: 0 }, true, away), away]);
    if (gatherNode) {
      nights.push(['gather', computeAccrual({
        ...BASE, activeKind: 'gather', activeId: gatherNode,
        skills: { woodcutting: MAXED, mining: MAXED, fishing: MAXED, farming: MAXED },
        equipment: {}, perks: { ok: true, companion: { id: 'sparrow', xp: 0 } }, companionXpBacked: true, away,
      }), away]);
    }
    if (recipeId) {
      const entry = ARTISAN_RECIPES_ALL[recipeId];
      const rc = entry.recipe;
      const bag = {};
      const inputs = rc.inputs ? rc.inputs : (rc.input ? { [rc.input]: rc.inputQty || 1 } : {});
      for (const [id, q] of Object.entries(inputs)) bag[id] = q * 100000;
      const skills = { ...COMBAT_SKILLS, [entry.skill]: MAXED };
      nights.push(['bench', computeAccrual({
        ...BASE, activeKind: 'artisan', activeId: recipeId, skills,
        equipment: {}, inventory: bag, perks: { ok: true, companion: { id: 'honeybee', xp: 0 } },
        companionXpBacked: true, away,
      }), away]);
    }
  }
  for (const [label, r, away] of nights) {
    const path = away ? 'away' : 'attended';
    ok(r && r.accrued === true, `companion-xp: the ${label} night (${path}) did not accrue (${r && r.reason}) — the deletion check asserts nothing`);
    if (!r || !r.accrued) continue;
    ok(!compOp(r), `companion-xp: the ${label} night (${path}) emitted ${JSON.stringify(compOp(r))} — companion XP was deleted from the engine`);
    ok(!('companion_xp_frac' in (r.delta || {})), `companion-xp: the ${label} night (${path}) proposed companion_xp_frac`);
  }
  if (!problems.length) {
    console.log(`Companion XP — the per-action rule is pinned; the engine writes no companion XP on ${nights.length} nights `
      + '(hunt, gather, bench; attended and away).');
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const problems = companionXpGuard();
  if (problems.length) {
    console.error('COMPANION-XP FAILED:\n' + problems.map((p) => '  ✗ ' + p).join('\n'));
    process.exit(1);
  }
  process.exit(0);
}
