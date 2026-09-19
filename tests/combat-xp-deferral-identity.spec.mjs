#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// tests/combat-xp-deferral-identity.spec.mjs
//
// FILED RED BY QA AGAINST b548; FIXED AND REGISTERED 2026-09-18. It is invoked
// by tests/run-smoke.mjs (so the GitHub `smoke` job runs it) and stands alone:
//   Run:  node tests/combat-xp-deferral-identity.spec.mjs      (expect exit 0)
// MUTATION PROOF — both arms verified red on 2026-09-18:
//   • delete the identity check at the top of resolveCombatXpDeferral  → exit 1
//     (1060 XP restored into character B, flushed with slot=1)
//   • delete the clearCombatXpDeferral() call in resetAccrualGate      → exit 1
//
// ── THE BUG IT PINS (QA-DEFER-ID, value class) ──────────────────────────────
// b548's `settle_first` deferral (src/net/accrue.js:480 `let deferredCombatXp`)
// is a bare module-global holding a per-skill XP map with NO IDENTITY attached —
// no user id, no character slot, no reference to the G it was taken from. Both
// halves of the hand-back are resolved LATE, at settle-answer time:
//
//   accrue.js:511  restorePendingCombatXp() writes into `window.G`  ← whatever G
//                  is current, not the G the snapshot came from
//   accrue.js:564  window.hrCreditCombatXpFlush(true)               ← and that
//                  flush resolves the slot at CALL time (goal-claim.js:53 →
//                  HearthriseProfile.activeSlot()), so the credit RPC is
//                  addressed to whoever is active NOW.
//
// So a deferral outstanding across a character switch is restored into the
// INCOMING character's pending map and credited to the INCOMING slot: character
// A's attended combat XP paid to character B, on a ranked surface, journalled as
// B's. That is the "a forged/misrouted client value must not cross into another
// character's ranking" property in CLAUDE.md §1.
//
// REACHABILITY, stated honestly (this is why it is P2 and not P0): the ordinary
// switch path (src/multi-character.js:339 switchSlotAsync) calls
// `location.reload()` right after `profile.activeSlot = slotId`, which usually
// kills the module before the settle answers. It is a RACE, not a rule —
// navigation does not commit synchronously, the pointer has ALREADY moved when
// it starts, and the `noReload` path exists. The sign-out hook has the same hole
// with no reload at all in front of it: auth.js:935 calls
// `HearthriseAccrual.resetAccrualGate()` as the identity reset, and that clears
// the gate but not `deferredCombatXp` (asserted below).
//
// ── THE FIX THIS SPEC IS WRITTEN AGAINST (systems-engineer's call) ───────────
// Stamp the deferral with the identity it was taken under
// ({ userId, slot } at defer time) and make resolveCombatXpDeferral() DROP —
// never restore — a snapshot whose identity does not match the live one; and
// clear the deferral in resetAccrualGate() so sign-out is a hard reset. Never
// pay it to the wrong character, and never silently pay it to the right one
// through the wrong G.
// ════════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);

export async function combatXpDeferralIdentitySpec() {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push('combat-xp-deferral-identity: ' + msg); };

  const src = await readFile(new URL('src/net/accrue.js', ROOT), 'utf8');
  const v = (src.match(/item-authority\.js\?v=(\d+)/) || [])[1];
  const A = await import(new URL('src/net/accrue.js' + (v ? `?v=${v}` : ''), ROOT).href);

  const prevWindow = globalThis.window;
  try {
    // ── ① THE CROSS-CHARACTER CREDIT ──────────────────────────────────────
    // Character A (slot 0) fights, the credit is refused `settle_first`, the
    // snapshot is deferred. The player then switches to character B (slot 1):
    // a new G is in place and the profile pointer has moved. The settle from
    // A's session finally answers `accrued`.
    A.__resetCombatXpDeferral();
    let slot = 0;
    const Ga = { _combatXpPending: { attack: 800, hitpoints: 260 } };
    const sent = [];
    globalThis.window = {
      G: Ga,
      HearthriseProfile: { activeSlot: () => slot },
      hrCreditCombatXpFlush: () => {
        sent.push({ slot: A.resolveActiveSlot(undefined), snap: { ...globalThis.window.G._combatXpPending } });
        return Promise.resolve(null);
      },
    };
    A.deferPendingCombatXp({ attack: 800, hitpoints: 260 });

    slot = 1;                                   // multi-character.js:391
    const Gb = { _combatXpPending: {} };        // character B's freshly loaded state
    globalThis.window.G = Gb;

    A.resolveCombatXpDeferral('accrued');
    await A.combatXpReflushPromise();

    const leaked = Object.values(Gb._combatXpPending || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    ok(leaked === 0,
      `THE CROSS-CHARACTER CREDIT: ${leaked} XP that character A fought for was restored into character B's pending map `
      + `— resolveCombatXpDeferral writes into whatever window.G is current (accrue.js:511)`);
    const toB = sent.filter((s) => s.slot !== 0);
    ok(toB.length === 0,
      `THE MISROUTED RPC: the deferred credit was flushed with slot=${toB.map((s) => s.slot).join(',')} `
      + `— the deferral carries no identity, so the flush addresses hr_credit_combat_xp to whoever is active now `
      + `(goal-claim.js:53). Character A's ranked XP is journalled as character B's.`);

    // ── ② SIGN-OUT IS NOT A RESET ─────────────────────────────────────────
    // auth.js:935 calls resetAccrualGate() as THE identity teardown on sign-out.
    // A deferral that survives it is account A's XP sitting in a module that
    // account B's session will resolve.
    A.__resetCombatXpDeferral();
    globalThis.window = { G: { _combatXpPending: { attack: 55 } } };
    A.deferPendingCombatXp({ attack: 55 });
    A.resetAccrualGate();
    ok(!A.pendingCombatXpDeferral(),
      'a deferral survived resetAccrualGate() — the hook auth.js:935 uses to tear identity down on sign-out leaves '
      + 'the previous account\'s attended XP held in module state for the next session to hand back');

    // ── ③ THE SIGN-OUT PATH, PLAYED (both-path rule) ──────────────────────
    // The switch leg above moves the SLOT. This leg moves the USER and leaves
    // the slot alone — account 1 defers on slot 0, signs out, account 2 signs
    // in on the same tab and the same slot 0, and their settle answers. Slot
    // equality must not be mistaken for identity.
    A.__resetCombatXpDeferral();
    let uid = 'user-one';
    const G1 = { _combatXpPending: { attack: 400 } };
    const sent2 = [];
    globalThis.window = {
      G: G1,
      HearthriseProfile: { activeSlot: () => 0 },
      HearthriseAuth: { currentUserId: () => uid },
      hrCreditCombatXpFlush: () => { sent2.push(1); return Promise.resolve(null); },
    };
    A.deferPendingCombatXp({ attack: 400 });
    uid = 'user-two';                              // the next account on this tab
    const G2 = { _combatXpPending: {} };
    globalThis.window.G = G2;
    A.resolveCombatXpDeferral('accrued');
    await A.combatXpReflushPromise();
    ok(!(Number(G2._combatXpPending.attack) > 0) && sent2.length === 0,
      `THE CROSS-ACCOUNT CREDIT: account one's 400 XP reached account two (pending=${G2._combatXpPending.attack || 0}, `
      + `flushes=${sent2.length}) — the slot is identical, so only the user id can tell these two apart`);

    // ── ④ THE HONEST PATH STILL PAYS ──────────────────────────────────────
    // The whole point of b548's deferral: an unchanged identity must still get
    // its XP back and still re-flush. An identity check that drops everything
    // would pass ①–③ and silently delete every player's refused XP.
    A.__resetCombatXpDeferral();
    const Gsame = { _combatXpPending: { attack: 120 } };
    let flushes = 0;
    globalThis.window = {
      G: Gsame,
      HearthriseProfile: { activeSlot: () => 2 },
      HearthriseAuth: { currentUserId: () => 'user-one' },
      hrCreditCombatXpFlush: () => { flushes++; return Promise.resolve(null); },
    };
    A.deferPendingCombatXp({ attack: 120 });
    Gsame._combatXpPending = {};                   // a flush drained the map meanwhile
    const back = A.resolveCombatXpDeferral('accrued');
    await A.combatXpReflushPromise();
    ok(back === 120 && Gsame._combatXpPending.attack === 120 && flushes === 1,
      `THE HONEST HAND-BACK REGRESSED: same user, same slot, restored=${back}, `
      + `pending=${Gsame._combatXpPending.attack}, flushes=${flushes} (expected 120/120/1) — `
      + 'the identity check must drop only what crossed, never the ordinary re-submit b548 exists for');
  } finally {
    A.__resetCombatXpDeferral();
    if (prevWindow === undefined) delete globalThis.window; else globalThis.window = prevWindow;
  }

  return { ok: problems.length === 0, problems };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = await combatXpDeferralIdentitySpec();
  for (const p of r.problems) console.error('✗ ' + p);
  if (r.ok) console.log('combat-xp-deferral-identity: a settle_first deferral cannot cross a character or an account — green');
  process.exit(r.ok ? 0 : 1);
}
