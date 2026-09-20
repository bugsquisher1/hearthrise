// ════════════════════════════════════════════════════════════════════════
// tests/companion-xp.mjs — THE COMPANION XP WRITER, proven server-owned,
// parity-pinned to the client, and byte-identical ATTENDED vs AWAY. ARMED
// since b550.
//
// THE CLAIM UNDER TEST: the accrual engine credits the EQUIPPED companion a
// `stat companion_xp:<id>` op for its role-matched actions over a settled
// window — the same per-action rule src/features/companions.js `awardXpForRole`
// would have run live — drawing no rng, clamped to the cap, and paying the
// IDENTICAL total whether the span was settled attended or replayed away
// (AWAY-1). The projection that prices the levelled passive bonus reads that
// exact stat row (2026-08-20-companion-model.sql hr_perks_of) and hr_state_of
// projects the roster the client renders, so with this writer armed the whole
// chain is closed.
//
// ⚠ WHY THE ARM IS THE FIX, NOT A FEATURE FLAG (b550, Paione ×2 on b549 —
//   "the pets are still not getting exp"): the client writer
//   (companions.js awardCompanionXp) has returned on `blobRetired()` for every
//   caller since b515. With the switch ALSO false there was no writer anywhere,
//   so `player_progress` never held a companion_xp row, hr_state_of projected
//   `xp: {}`, reconcileCompanions rebuilt every pet at 0, and every pet in the
//   game was permanently level 1. §1 below is the pin that now catches that.
//
// The `companionXpBacked: false` runs kept below are NOT a dormancy claim any
// more — they are the negative control that proves the op comes from the arm
// and not from somewhere else in the delta.
//
// The engine runs for real (computeAccrual over the live catalogue); the client
// per-action matrix is restated and PINNED here because companions.js reaches
// for window and cannot be imported.
//
// Run: node tests/companion-xp.mjs   (exit 0 = green)
// Also invoked as a preflight by tests/run-smoke.mjs.
// ════════════════════════════════════════════════════════════════════════

import { pathToFileURL } from 'node:url';

import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import { GATHER_NODES, ARTISAN_RECIPES_ALL } from '../supabase/functions/hr-accrue/catalogue.js';
import {
  companionActionXp, companionSpanXp, COMPANION_XP_CAP, COMPANION_XP_SERVER_BACKED,
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
  return computeAccrual({
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

  // ── 1. THE ARM SWITCH IS ARMED — COMPANION XP HAS A WRITER ──────────────
  /* b550, Paione (live b549, twice): "the pets are still not getting exp".
     This pin USED TO assert the switch was false, on the premise stated in the
     module header that while it was false "the client keeps awarding into its
     own G.companions blob". b515 had already retired that client writer
     (companions.js blobRetired() is the literal `true`, so awardCompanionXp
     returns for every caller), and the premise went stale WITHOUT THIS GUARD
     NOTICING — because a guard that pins a switch to `false` cannot tell
     "dormant by design" from "nothing writes this number at all".

     So the pin is inverted AND widened: the arm is on, and (below) the engine
     actually emits the op on both paths. Turning the switch back to false does
     not restore a client writer; it restores "no pet in the game can gain XP". */
  ok(COMPANION_XP_SERVER_BACKED === true,
    'companion-xp: COMPANION_XP_SERVER_BACKED is not true — companion XP has NO writer at all '
    + '(the client half has been gated off since b515), so every pet is frozen at level 1');

  // ── 2. THE PER-ACTION MATRIX MATCHES companions.js awardXpForRole ────────
  // Restated from src/features/companions.js (which cannot be imported): a
  // dedicated pet earns 1, a utility/hybrid pet 0.5, a mismatched pet 0.
  const MATRIX = [
    ['combat', 'combat-kill', 1], ['combat', 'gather', 0], ['combat', 'artisan', 0],
    ['gather', 'gather', 1], ['gather', 'combat-kill', 0], ['gather', 'artisan', 0],
    ['artisan', 'artisan', 1], ['artisan', 'gather', 0], ['artisan', 'combat-kill', 0],
    ['utility', 'combat-kill', 0.5], ['utility', 'gather', 0.5], ['utility', 'artisan', 0.5],
    ['hybrid', 'combat-kill', 0.5], ['hybrid', 'gather', 0.5], ['hybrid', 'artisan', 0.5],
  ];
  for (const [role, act, want] of MATRIX) {
    ok(companionActionXp(role, act) === want,
      `companion-xp: companionActionXp(${role}, ${act}) = ${companionActionXp(role, act)}, expected ${want} — drifted from awardXpForRole`);
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

  // ── 4. COMBAT — THE OP IS EMITTED, EXACTLY per KILL, ONLY WHEN ARMED ─────
  const none = runCombat(null, true);
  const wolfOff = runCombat({ id: 'wolf_pup', xp: 0 }, false);
  const wolfOn = runCombat({ id: 'wolf_pup', xp: 0 }, true);
  ok(wolfOn.accrued === true, `companion-xp: combat fixture did not accrue (${wolfOn.reason})`);
  ok(wolfOn.summary.kills > 100,
    `companion-xp COVERAGE: only ${wolfOn.summary.kills} kills — a trivial span proves little`);

  // DORMANT emits nothing.
  ok(!compOp(wolfOff), 'companion-xp: DORMANT combat still emitted a companion_xp op — not inert');
  ok(!compOp(none), 'companion-xp: no-companion combat emitted a companion_xp op');

  // ARMED emits exactly one op, keyed to the equipped id, add == kills (1/kill).
  const wop = compOp(wolfOn);
  ok(wop && wop.key === 'companion_xp:wolf_pup' && wop.kind === 'stat' && wop.period === '' && wop.state === 'active',
    `companion-xp: armed combat op is malformed: ${JSON.stringify(wop)}`);
  ok(wop && wop.add === wolfOn.summary.kills,
    `companion-xp: armed combat op add=${wop && wop.add} but kills=${wolfOn.summary.kills} — the count basis is not per-kill`);
  ok(wop && wop.add === companionSpanXp({ companionId: 'wolf_pup', currentXp: 0, activityType: 'combat-kill', actionCount: wolfOn.companionActions }),
    'companion-xp: armed combat op disagrees with companionSpanXp over the exposed action count');

  // A utility pet (fox) over the same span earns floor(0.5*kills).
  const foxOn = runCombat({ id: 'fox', xp: 0 }, true);
  const fop = compOp(foxOn);
  ok(fop && fop.add === Math.floor(0.5 * foxOn.summary.kills),
    `companion-xp: fox (utility) armed op add=${fop && fop.add}, expected floor(0.5*${foxOn.summary.kills})`);

  // ── 5. AWAY == LIVE, BYTE-IDENTICAL, WITH THE OP PRESENT ────────────────
  // The AWAY-1 obligation for the writer: the companion op is deterministic, so
  // an away replay and a live settle of the same span emit the identical op AND
  // the whole simulation is unchanged (it draws no rng).
  const wolfOnLive = runCombat({ id: 'wolf_pup', xp: 0 }, true, false);
  ok(JSON.stringify(wolfOn.delta.progress) === JSON.stringify(wolfOnLive.delta.progress),
    'companion-xp: the progress delta differs away vs live — the writer is not draw-free/deterministic');
  ok(JSON.stringify(wolfOn.summary) === JSON.stringify(wolfOnLive.summary),
    'companion-xp: the summary differs away vs live with the writer armed — a draw was moved');

  // ── 6. THE WRITER PERTURBS NO SEEDED DRAW ───────────────────────────────
  // Arming the writer must not change kills/xp/gold — it only appends a stat op.
  ok(JSON.stringify(wolfOff.summary) === JSON.stringify(wolfOn.summary),
    'companion-xp: arming the writer changed the combat summary — it must only append a stat op');

  // ── 7. GATHER — the op is per gather-yield action ───────────────────────
  // Sparrow is a gather pet (1/action). Pick a node that actually yields.
  const gatherNode = Object.keys(GATHER_NODES).find((id) => {
    const r = computeAccrual({
      ...BASE, activeKind: 'gather', activeId: id,
      skills: { woodcutting: MAXED, mining: MAXED, fishing: MAXED, farming: MAXED },
      equipment: {}, perks: { ok: true, companion: { id: 'sparrow', xp: 0 } },
      companionXpBacked: true,
    });
    return r.accrued === true && r.companionActions > 0;
  });
  ok(gatherNode, 'companion-xp: no gather node yielded in 12h — cannot exercise the gather writer');
  if (gatherNode) {
    const gOn = computeAccrual({
      ...BASE, activeKind: 'gather', activeId: gatherNode,
      skills: { woodcutting: MAXED, mining: MAXED, fishing: MAXED, farming: MAXED },
      equipment: {}, perks: { ok: true, companion: { id: 'sparrow', xp: 0 } },
      companionXpBacked: true,
    });
    const gOffRun = computeAccrual({
      ...BASE, activeKind: 'gather', activeId: gatherNode,
      skills: { woodcutting: MAXED, mining: MAXED, fishing: MAXED, farming: MAXED },
      equipment: {}, perks: { ok: true, companion: { id: 'sparrow', xp: 0 } },
      companionXpBacked: false,
    });
    const gop = compOp(gOn);
    ok(gop && gop.key === 'companion_xp:sparrow' && gop.add === gOn.companionActions && gop.add > 0,
      `companion-xp: gather op add=${gop && gop.add} but companionActions=${gOn.companionActions} (sparrow is 1/action)`);
    ok(!compOp(gOffRun), 'companion-xp: DORMANT gather emitted a companion_xp op — not inert');
  }

  // ── 8. ARTISAN — the op is per produce action, on a PAYABLE bench ────────
  // Honeybee is an artisan pet (1/action); it earns on any artisan activity. Use
  // a payable (non-cooking) bench so the engine actually settles it.
  const recipeId = Object.entries(ARTISAN_RECIPES_ALL).find(([, e]) => {
    const rc = e && e.recipe;
    return e && e.skill && benchPayable(e.skill) && rc && !rc.gated && (rc.inputs || rc.input);
  })?.[0];
  ok(recipeId, 'companion-xp: no payable ungated recipe found — cannot exercise the artisan writer');
  if (recipeId) {
    const entry = ARTISAN_RECIPES_ALL[recipeId];
    const rc = entry.recipe;
    const recipe = recipeId;
    const bag = {};
    const inputs = rc.inputs ? rc.inputs : (rc.input ? { [rc.input]: rc.inputQty || 1 } : {});
    for (const [id, q] of Object.entries(inputs)) bag[id] = q * 100000;   // plenty
    const skills = { ...COMBAT_SKILLS };
    skills[entry.skill] = MAXED;
    const common = {
      ...BASE, activeKind: 'artisan', activeId: recipe, skills,
      equipment: {}, inventory: bag, perks: { ok: true, companion: { id: 'honeybee', xp: 0 } },
    };
    const aOn = computeAccrual({ ...common, companionXpBacked: true });
    const aOff = computeAccrual({ ...common, companionXpBacked: false });
    ok(aOn.accrued === true, `companion-xp: artisan fixture (${recipe}) did not accrue (${aOn.reason})`);
    if (aOn.accrued) {
      const aop = compOp(aOn);
      ok(aop && aop.key === 'companion_xp:honeybee' && aop.add === aOn.companionActions && aop.add > 0,
        `companion-xp: artisan op add=${aop && aop.add} but companionActions=${aOn.companionActions} (honeybee is 1/action)`);
      ok(!compOp(aOff), 'companion-xp: DORMANT artisan emitted a companion_xp op — not inert');
    }
  }

  /* ── 9. BOTH-PATH (CLAUDE.md §4) — ATTENDED AND AWAY PAY THE SAME TOTAL ──
     §5 proved it for combat. b509 is why that is not enough: a channel tested
     nine ways on the AWAY path while the ATTENDED path did something else
     entirely. Companion XP is credited on both — index.ts (away accrual) and
     set-activity.js (the attended settle) each thread `companionXpBacked`, and
     an A14 parity guard exists precisely because a field added to one and not
     the other prices the same window two ways.

     So every channel that can award is run TWICE over the identical span, once
     attended (`away: false`) and once away (`away: true`), and the grant must be
     the same integer. A difference here means a player who stays logged in and a
     player who closes the tab get different pets out of the same night. */
  const bothPath = (label, mk) => {
    const attended = mk(false);
    const away = mk(true);
    const aOp = compOp(attended);
    const wOp = compOp(away);
    ok(aOp && aOp.add > 0,
      `companion-xp BOTH-PATH ${label}: the ATTENDED settle emitted no companion_xp grant `
      + `(${JSON.stringify(aOp || null)}) — a player who stays logged in would train no pet`);
    ok(wOp && wOp.add > 0,
      `companion-xp BOTH-PATH ${label}: the AWAY replay emitted no companion_xp grant `
      + `(${JSON.stringify(wOp || null)})`);
    ok(aOp && wOp && aOp.add === wOp.add && aOp.key === wOp.key,
      `companion-xp BOTH-PATH ${label}: attended paid ${aOp && aOp.add} but away paid ${wOp && wOp.add} `
      + '— the same span must train the pet the same amount on both paths (AWAY-1)');
    return aOp ? aOp.add : 0;
  };

  const bpCombat = bothPath('combat', (away) => runCombat({ id: 'wolf_pup', xp: 0 }, true, away));

  let bpGather = 0;
  if (gatherNode) {
    bpGather = bothPath('gather', (away) => computeAccrual({
      ...BASE, activeKind: 'gather', activeId: gatherNode,
      skills: { woodcutting: MAXED, mining: MAXED, fishing: MAXED, farming: MAXED },
      equipment: {}, perks: { ok: true, companion: { id: 'sparrow', xp: 0 } },
      companionXpBacked: true, away,
    }));
  }

  let bpArtisan = 0;
  if (recipeId) {
    const entry = ARTISAN_RECIPES_ALL[recipeId];
    const rc = entry.recipe;
    const bag = {};
    const inputs = rc.inputs ? rc.inputs : (rc.input ? { [rc.input]: rc.inputQty || 1 } : {});
    for (const [id, q] of Object.entries(inputs)) bag[id] = q * 100000;
    const skills = { ...COMBAT_SKILLS };
    skills[entry.skill] = MAXED;
    bpArtisan = bothPath('artisan', (away) => computeAccrual({
      ...BASE, activeKind: 'artisan', activeId: recipeId, skills,
      equipment: {}, inventory: bag, perks: { ok: true, companion: { id: 'honeybee', xp: 0 } },
      companionXpBacked: true, away,
    }));
  }

  /* THE PET'S CURRENT XP IS AN INPUT, AND IT IS THE SERVER'S. A pet already
     near the cap must be paid less on BOTH paths, identically — the clamp reads
     `inp.perks.companion.xp`, which is hr_perks_of's row, never a client value.
     Without this a capped pet would keep accruing rows the projection ignores. */
  const nearCapAttended = compOp(runCombat({ id: 'wolf_pup', xp: COMPANION_XP_CAP - 3 }, true, false));
  const nearCapAway = compOp(runCombat({ id: 'wolf_pup', xp: COMPANION_XP_CAP - 3 }, true, true));
  ok(nearCapAttended && nearCapAttended.add === 3 && nearCapAway && nearCapAway.add === 3,
    'companion-xp BOTH-PATH cap: a pet 3 XP from the cap must be paid exactly 3 on both paths, got '
    + `attended=${nearCapAttended && nearCapAttended.add} away=${nearCapAway && nearCapAway.add}`);
  ok(!compOp(runCombat({ id: 'wolf_pup', xp: COMPANION_XP_CAP }, true, false))
     && !compOp(runCombat({ id: 'wolf_pup', xp: COMPANION_XP_CAP }, true, true)),
    'companion-xp BOTH-PATH cap: a MAXED pet must emit no op at all on either path');

  if (!problems.length) {
    console.log(`Companion XP writer ARMED — both-path totals identical (combat ${bpCombat}, `
      + `gather ${bpGather}, artisan ${bpArtisan} xp attended == away).`);
    console.log(`Companion XP writer — per-action matrix matches awardXpForRole; combat op is exactly `
      + `per-kill (${wolfOn.summary.kills} kills → ${compOp(wolfOn).add} xp), gather/artisan per produce; `
      + `byte-identical away vs live; clamps to the L30 cap (${COMPANION_XP_CAP}); the disarmed negative control emits nothing.`);
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
