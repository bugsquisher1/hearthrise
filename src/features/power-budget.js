// ============================================================
// src/features/power-budget.js — THE PER-KEY POWER BUDGET (b228)
//
// docs/design/bonus-rebase.md §2.2, §4.1. Tyler, binding, 2026-08-09:
// *"the % boosts across the board are way too high. 50% smithing? it should be
// like increments of 2%."*
//
// ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────
// `getBonus` is not a function. It is a base function plus six additive
// monkey-patch wrappers, each of which does `t += …` and calls the one below:
//
//   0  legacy.js       room rungs, plot buildings, renown, homestead capstone
//   1  companions.js   the equipped pet
//   2  legacy.js       food & drink buffs
//   3  clans.js        clan level perks
//   4  clan-seat-ui.js the castle: buildings + the feast
//   5  muster.js       the live rally aura
//   6  world-events.js the daily/weekly blessing
//
// Until b228 the only fuse in the game lived at layer 4 and reduced ONLY layer
// 4's own contribution. Layers 5 and 6 — plus companions and buffs below it —
// were added afterwards and nothing clamped the output. It also policed one
// key, `allXP`, which is how `smithSpeed` reached +90% without anyone noticing.
//
// A fuse that a later wrapper escapes is worse than no fuse, because it is a
// false assurance written into the code. So the budget moved HERE, and this
// wrapper installs LAST, where nothing can be added after it.
//
// ── THE THREE NUMBERS ───────────────────────────────────────────────────────
//   permanent(key) ≤ 0.20   the fuse. Five points above the +15% the pillars
//                           are DESIGNED to sum to, because a fuse that binds
//                           today is a nerf and a fuse that never binds is a
//                           guarantee.
//   temporary(key) ≤ 0.15   the ceremony budget. The realm can never hand you
//                           more than you have earned.
//   total(key)     ≤ 0.30   the absolute peak. Nothing in the game may exceed
//                           it — at the clamp, allXP is exactly double what
//                           you earned.
//
// ── HOW PERMANENT IS TOLD APART FROM TEMPORARY ──────────────────────────────
// The chain returns one number, so the split cannot be read out of it. The
// temporary sources are therefore asked DIRECTLY, each through its own owner,
// and permanent is the remainder. That is deliberate: reading the owners means
// the split can never be fooled by a wrapper that runs in a different order,
// which is the exact failure mode this file was written to end. If an owner is
// missing or throws, its contribution reads 0 — the budget then treats that
// power as PERMANENT, which is the strict direction (0.20 rather than 0.15).
//
// ── WHAT IS GOVERNED, AND WHAT IS NOT ───────────────────────────────────────
// The grammar governs THROUGHPUT multipliers — the keys that multiply what an
// hour of play is worth. Four other classes are outside it (§2.5) and are
// listed explicitly below rather than left to a default, because "everything
// not named" is how an exemption quietly becomes a loophole.
// ============================================================
(function () {
  'use strict';

  var PERMANENT_CAP = 0.20;
  var TEMPORARY_CAP = 0.15;
  var TOTAL_CAP     = 0.30;

  /* The nine keys the budget governs. Every one of them multiplies a rate. */
  var GOVERNED = {
    allXP: 1, combatXP: 1, goldFind: 1,
    gatherSpeed: 1, cookSpeed: 1, smithSpeed: 1, craftSpeed: 1, prayerSpeed: 1,
    raidPower: 1
  };

  /* Everything deliberately OUTSIDE it, with the reason, so the next reader
     does not have to reconstruct the argument:
       farmYield     capacity — a COUNT of extra crops, not a multiplier
       noBurn        reliability — removing a failure state cannot stack into a
                     faucet; burn-proof is burn-proof and there is no
                     burn-proof-er
       buffDuration  duration — lengthens a window you already earned, never
                     raises a magnitude
       restedXp      retired in b228; Rested is a flat XP quantum now
       yield_cooking / yield_smithing / craftSave
                     output procs, already inside the 4/8% grammar and an order
                     of magnitude below any cap
       storage, dropRate, damage, monsterRespawn, crit, rareDrop
                     ghost keys with no reader (§1.7) */

  function governed(key) { return GOVERNED[key] === 1; }

  /* ── the temporary half, asked of each owner ──────────────────────────── */

  function feastPart(key) {
    var U = window.HearthriseClanSeatUI;
    if (!U || typeof U.feastBonus !== 'function') return 0;
    return Number(U.feastBonus(key)) || 0;
  }
  function blessingPart(key) {
    var W = window.HearthriseWorldEvents;
    if (!W || typeof W.liveBonusFor !== 'function') return 0;
    return Number(W.liveBonusFor(key)) || 0;
  }
  function musterPart(key) {
    var M = window.HearthriseMuster;
    if (!M || typeof M.liveAura !== 'function') return 0;
    return Number(M.liveAura(key)) || 0;
  }
  function buffPart(key) {
    if (typeof window.getBuffBonuses !== 'function') return 0;
    var b = window.getBuffBonuses();
    return (b && typeof b[key] === 'number') ? b[key] : 0;
  }

  /* Every source that is temporary by nature: it ends, on a clock nobody can
     stop. A player cannot hold this power indefinitely, which is the whole
     reason it gets its own budget rather than competing for the permanent one. */
  function temporaryFor(key) {
    var t = 0;
    try { t += feastPart(key); } catch (e) {}
    try { t += blessingPart(key); } catch (e) {}
    try { t += musterPart(key); } catch (e) {}
    try { t += buffPart(key); } catch (e) {}
    return t;
  }

  /* ── the clamp ─────────────────────────────────────────────────────────── */

  /* Splits `total` into its permanent and temporary halves, clamps each to its
     own budget, then clamps the sum to the absolute peak.

     NEGATIVE totals pass through untouched. Every cap here is a ceiling on how
     much a player may GAIN; none of them is a floor on how much a debuff may
     take, and treating them as one would make a curse into a blessing. */
  function applyBudget(key, total) {
    if (!governed(key)) return total;
    var v = Number(total);
    if (!isFinite(v) || v <= 0) return total;

    var temp = temporaryFor(key);
    if (!isFinite(temp) || temp < 0) temp = 0;
    if (temp > v) temp = v;                       // never invent permanent debt
    var perm = v - temp;

    if (perm > PERMANENT_CAP) perm = PERMANENT_CAP;
    if (temp > TEMPORARY_CAP) temp = TEMPORARY_CAP;
    var out = perm + temp;
    if (out > TOTAL_CAP) out = TOTAL_CAP;
    return out;
  }

  /* Is the budget currently binding on this key? The panel that says "the
     realm's blessing is at its limit" reads this — a ceiling players chase is
     a feature, and a ceiling silently applied is a bug. */
  function atLimit(key) {
    if (!governed(key) || typeof window.getBonus !== 'function') return false;
    var raw = rawFor(key);
    return raw > applyBudget(key, raw) + 1e-9;
  }

  /* The chain's answer BEFORE this wrapper — what the player would have had
     with no budget. Used by atLimit and by the suite. */
  var _inner = null;
  function rawFor(key) {
    if (typeof _inner !== 'function') return 0;
    var v = Number(_inner(key));
    return isFinite(v) ? v : 0;
  }

  /* ── installation ──────────────────────────────────────────────────────── */
  //
  // Install order is genuinely dynamic: clan-seat-ui.js retries its own hook on
  // a 200ms timer until getBonus exists, and companions.js installs from the
  // ESM boot after every classic script has run. So "load last" is necessary
  // and not sufficient — ensureOutermost() re-wraps whenever something else has
  // wrapped on top of us.
  //
  // Re-wrapping is SAFE rather than merely tolerable: clamping is idempotent
  // (an inner clamp followed by a later addition is clamped again by the outer
  // one, and min(min(x)) is min(x)), and the permanent/temporary split is
  // recomputed from the owners each time rather than carried through the chain.
  // The counter is a seatbelt against a pathological reinstall loop, not a
  // design assumption.
  var MAX_INSTALLS = 8;
  var installs = 0;

  function install() {
    if (typeof window.getBonus !== 'function') return false;
    if (window.getBonus.__hrPowerBudget === true) return true;
    if (installs >= MAX_INSTALLS) return false;
    installs++;
    var orig = window.getBonus;
    _inner = function (key) { try { return orig(key); } catch (e) { return 0; } };
    var wrapped = function (key) {
      var t = orig.apply(this, arguments);
      try { return applyBudget(key, t); } catch (e) { return t; }
    };
    wrapped.__hrPowerBudget = true;
    window.getBonus = wrapped;
    return true;
  }
  function ensureOutermost() { return install(); }

  /* Boot: install as soon as getBonus exists, then re-check across the window
     in which the other wrappers arrive. The interval is deliberately cheap and
     permanent — a property check on a function, once a second, forever — because
     the alternative is a boot-order assumption, and boot-order assumptions are
     exactly what produced the escaped fuse this file replaces. */
  function boot() {
    if (!install()) { setTimeout(boot, 200); return; }
    setInterval(ensureOutermost, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.HearthrisePowerBudget = {
    PERMANENT_CAP: PERMANENT_CAP,
    TEMPORARY_CAP: TEMPORARY_CAP,
    TOTAL_CAP: TOTAL_CAP,
    GOVERNED: GOVERNED,
    governed: governed,
    temporaryFor: temporaryFor,
    applyBudget: applyBudget,
    atLimit: atLimit,
    rawFor: rawFor,
    install: install,
    ensureOutermost: ensureOutermost
  };

  console.log('[power-budget] per-key budget armed — permanent ' + PERMANENT_CAP +
              ' / temporary ' + TEMPORARY_CAP + ' / peak ' + TOTAL_CAP);
})();
