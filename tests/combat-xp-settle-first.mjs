#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// tests/combat-xp-settle-first.mjs — A CREDIT MAY NOT TRIM A WINDOW IT DID NOT PAY.
//
// THE LIVE BUG (Paione, 2026-09-09 11:52 UTC, b529): "I did some offline combat.
// The items and kills are given but the experience is not." The ledger, in order:
//
//   combat xp_credit  12   @11:51:40    ← the booting client's attended cadence
//   combat xp_credit  64   @11:52:05
//   combat xp_credit  146  @11:52:27
//   combat accrue     ms=14,552,349 kills=828 xp_in=0 @11:52:30
//                     delta = { g, i, k } — NO `x` KEY
//
// Each accepted credit stamped `player_state.combat_xp_accrued_to = now()`, and
// the settle's eligible-from is max(credit.fromMs, combat_xp_accrued_to)
// (supabase/functions/hr-accrue/accrual.js), so the whole 4h02m window became
// ineligible. Loot, gold and kills are not watermark-split — they paid. 30-day
// census: 17 such rows, 2 players, 3,991 kills, 60.2 hours.
//
// THIS GUARD PROVES BOTH HALVES OF THE FIX, by execution:
//
//   1. THE RULE (src/core/combat-xp-cap.js combatXpCreditRefusal) refuses over an
//      unpaid away window and admits the honest live cadence — and the migration
//      vendors the same threshold (bound by tests/combat-xp-cap-drift.mjs).
//   2. THE SETTLE, run for real through computeAccrual over Paione's own window:
//      with the watermark ARMED at now() (what three accepted credits did) it pays
//      ZERO combat XP while still paying gold and loot — the exact live symptom,
//      reproduced; with the watermark LEFT ALONE (what a `settle_first` refusal
//      guarantees) the same span pays the whole window's XP.
//   3. THE CLIENT ORDERING (src/net/accrue.js): requestAccrual must NOT flush the
//      attended combat-XP credit before the session's FIRST settle, and must
//      resume flushing after it. RED against b529, where the flush was
//      unconditional and fired three times inside the boot settle.
//
// The SQL half's own §4 block (2026-09-09-combat-xp-settle-first.sql GATE(P1)-(P8))
// executes the same sequence against the real function; it cannot run here because
// this guard has no database.
//
// Run standalone:  node tests/combat-xp-settle-first.mjs
// ════════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import { COMBAT_XP_SETTLE_FIRST_MS, combatXpCreditRefusal } from '../src/core/combat-xp-cap.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';

const ROOT = new URL('../', import.meta.url);

/* Paione's own row, to the millisecond: 2026-09-09T07:49:56.169Z →
   2026-09-09T11:52:28.518Z, clay golems (the drop mix — iron_ore .45,
   iron_fitting .30, coal .35 over 828 kills — identifies the monster exactly). */
const FROM_MS = Date.parse('2026-09-09T07:49:56.169Z');
const NOW_MS = Date.parse('2026-09-09T11:52:28.518Z');
const SPAN_MS = NOW_MS - FROM_MS;                       // 14,552,349
const MONSTER = MONSTERS.clay_golem ? 'clay_golem' : Object.keys(MONSTERS)[0];
const FOOD = ITEMS.cooked_trout ? 'cooked_trout' : Object.keys(ITEMS).find((k) => ITEMS[k]?.foodClass === 'healing');

/* Pull a balanced `{...}` body that follows `head` in the source - the branch is
   multi-line with nested braces, so a lazy regex would hand back an unbalanced
   fragment and `new Function` would throw (which reads as "no branch"). */
function extractBranchBody(src, head) {
  const at = src.indexOf(head);
  if (at < 0) return null;
  const open = src.indexOf('{', at + head.length);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  return null;
}

function settleRun(over) {
  return computeAccrual({
    userId: '00000000-0000-4000-8000-00000000000c',
    slot: 0, nowMs: NOW_MS, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
    activeKind: 'combat', activeId: MONSTER, capMs: SPAN_MS, seed: 0x9a1043,
    hp: 300, maxHp: 300, gold: 0,
    skills: {
      attack: 1210421, strength: 1210421, defense: 1210421,
      hitpoints: 1210421, ranged: 100, magic: 100, prayer: 100,
    },
    equipment: {}, items: ITEMS, monsters: MONSTERS,
    autoEatEnabled: true, autoEatFood: FOOD, autoEatPct: 50,
    inventory: { [FOOD]: 100000 },
    ...over,
  });
}
const xpOf = (r) => (r && r.accrued && r.delta && r.delta.xp) ? r.delta.xp : {};
const sumXp = (xp) => Object.values(xp).reduce((a, b) => a + (Number(b) || 0), 0);

export async function combatXpSettleFirstGuard() {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push('combat-xp-settle-first: ' + msg); };

  // ── 1. THE RULE ───────────────────────────────────────────────────────────
  ok(combatXpCreditRefusal(NOW_MS, FROM_MS) === 'settle_first',
    `a credit over Paione's unpaid 4h02m window was admitted, not refused`);
  ok(combatXpCreditRefusal(NOW_MS, NOW_MS - 60000) === null,
    'the honest 60 s live cadence was refused — the threshold is too tight to credit attended play');
  ok(combatXpCreditRefusal(NOW_MS, NOW_MS - (COMBAT_XP_SETTLE_FIRST_MS - 1)) === null,
    'just inside the threshold was refused');
  ok(combatXpCreditRefusal(NOW_MS, NOW_MS - (COMBAT_XP_SETTLE_FIRST_MS + 1)) === 'settle_first',
    'just outside the threshold was admitted');
  ok(combatXpCreditRefusal(NOW_MS, 0) === null,
    'a character with no settle watermark at all must not be locked out of the credit');

  // ── 2. THE SETTLE, over Paione's own window ───────────────────────────────
  const unarmed = settleRun({ combatXpAccruedToMs: FROM_MS });
  const unarmedXp = xpOf(unarmed);
  ok(unarmed.accrued, 'the 4h02m combat span did not accrue at all — the fixture is not exercising the path');
  ok(sumXp(unarmedXp) > 0,
    'THE BUG: a 4h02m away combat span paid NO combat XP even with the watermark left at the window start');
  const kills = Number(unarmed?.delta?.kills ?? unarmed?.kills ?? 0) || 0;

  // The live state after three accepted credits: the watermark AT the end of the
  // window. This is what b529 produced and what the fix makes unreachable.
  const armed = settleRun({ combatXpAccruedToMs: NOW_MS });
  const armedXp = xpOf(armed);
  ok(sumXp(armedXp) === 0,
    'the reproduction is not reproducing: a watermark at now() should trim every XP grant (that is the reported bug)');
  ok(Number(armed?.delta?.gold || 0) > 0 && Object.keys(armed?.delta?.items || {}).length > 0,
    'the reproduction should still pay GOLD and ITEMS with XP trimmed — that asymmetry is the player-visible symptom');
  ok(sumXp(unarmedXp) > 1000,
    `the window an armed watermark destroys is not trivial (measured ${sumXp(unarmedXp)} XP over ${kills} kills)`);

  // ── 3. THE CLIENT ORDERING ────────────────────────────────────────────────
  // RED against b529: requestAccrual awaited window.hrCreditCombatXpFlush(true)
  // unconditionally, so the boot settle was preceded by a credit that armed the
  // trim above.
  const src = await readFile(new URL('src/net/accrue.js', ROOT), 'utf8');
  const v = (src.match(/item-authority\.js\?v=(\d+)/) || [])[1];
  const A = await import(new URL('src/net/accrue.js' + (v ? `?v=${v}` : ''), ROOT).href);

  ok(typeof A.awaySettleDone === 'function',
    'accrue.js publishes no settle-first latch — the boot path can still credit XP over an unpaid away window');
  if (typeof A.awaySettleDone === 'function') {
    const prevWindow = globalThis.window;
    const prevFetch = globalThis.fetch;
    const flushes = [];
    try {
      A.__resetAwaySettleLatch(false);
      // C1: XP observed BEFORE the first settle. The settle is about to pay this
      // same window by simulation, so it must not still be pending afterwards.
      const G = { _combatXpPending: { attack: 500, hitpoints: 170 } };
      globalThis.window = { G, hrCreditCombatXpFlush: (f) => { flushes.push(!!f); return Promise.resolve(null); } };
      // "nothing to pay" — accrued:false, the simplest verdict that still means the
      // server has closed the window (accrued_to = now()).
      globalThis.fetch = async () => ({ status: 200, json: async () => ({ ok: true, accrued: false, reason: 'none' }) });
      A.configureAccrual({ url: 'https://example.invalid/hr-accrue', apiKey: 'k', authToken: 't', slot: 0 });

      ok(A.awaySettleDone() === false, 'the latch is open before any settle — a fresh document has settled nothing');
      const first = await A.requestAccrual({ force: true });
      ok(first && (first.outcome === 'nothing' || first.outcome === 'accrued'),
        `the harness settle did not answer (outcome ${first && first.outcome}) — the ordering assertion below would be vacuous`);
      ok(flushes.length === 0,
        'THE BUG: the boot settle was preceded by an attended combat-XP credit, which stamps the watermark and trims the away window');
      ok(A.awaySettleDone() === true, 'the latch did not close on an answered settle — the credit would be suppressed forever');

      const second = await A.requestAccrual({ force: true });
      ok(second && second.outcome, 'the second accrual did not answer');
      ok(flushes.length === 1 && flushes[0] === true,
        'credit-before-settle did not resume once the away window was paid — attended XP would be priced unattended');

      // ── C1, over-pay in the other direction ────────────────────────────────
      const pendAfter = Object.values(G._combatXpPending || {}).reduce((a, b) => a + (Number(b) || 0), 0);
      ok(pendAfter === 0,
        `THE DOUBLE-CREDIT: ${pendAfter} XP observed before the boot settle is still pending after it — the settle paid that window by simulation and the next flush would pay it again`);

      // -- A `settle_first` REFUSAL: DEFERRED, NOT DISCARDED (rev.2, 2026-09-17) -
      // The property is still "the settle's window is never credited twice", but
      // the refusal is NOT the moment it is satisfied: the refusal writes nothing
      // server-side (no watermark move), so nothing has paid those fights yet.
      // Dropping there deleted a throttled tab's attended XP whenever the settle
      // then failed or never ran (41 refusals, one character, 2026-09-16/17). The
      // debt is held and retired by a CONFIRMED settle instead - and BOTH halves
      // are asserted here, so neither "always drop" nor "never drop" is green.
      ok(typeof A.dropPendingCombatXp === 'function' && typeof A.deferPendingCombatXp === 'function'
        && typeof A.resolveCombatXpDeferral === 'function',
        'accrue.js publishes no defer/resolve seam - legacy.js has nowhere to hold a settle_first snapshot and would discard it on the refusal');
      if (typeof A.dropPendingCombatXp === 'function') {
        const G2 = { _combatXpPending: { attack: 900, strength: 40 } };
        const snap = { attack: 900, strength: 40 };
        G2._combatXpPending.attack += 25;                       // a gain DURING the call
        A.dropPendingCombatXp(snap, G2);
        ok((Number(G2._combatXpPending.attack) || 0) === 25 && (Number(G2._combatXpPending.strength) || 0) === 0,
          `the shared subtract left ${JSON.stringify(G2._combatXpPending)} pending - a retired window must not be re-credited (gains during the call must survive)`);
      }
      // ...and legacy.js's flush must actually RUN that deferral on the refusal.
      // The branch body is extracted from the source and EXECUTED against stubs,
      // so a branch that is present but inert (the mutation) is red, not green.
      const legacySrc = await readFile(new URL('src/legacy.js', ROOT), 'utf8');
      const branch = extractBranchBody(legacySrc, "cr.error==='settle_first')");
      ok(!!branch,
        'hrCreditCombatXpFlush has no settle_first branch - a refused window stays pending and is credited a second time');
      if (branch && typeof A.resolveCombatXpDeferral === 'function') {
        A.__resetCombatXpDeferral();
        const G3 = { _combatXpPending: { attack: 700 } };
        const snap3 = { attack: 700 };
        let asked = 0;
        const AC = {
          dropPendingCombatXp: A.dropPendingCombatXp,
          deferPendingCombatXp: A.deferPendingCombatXp,
          requestAccrual: () => { asked++; return Promise.resolve({ outcome: 'unreachable' }); },
        };
        // eslint-disable-next-line no-new-func
        new Function('_AC', 'snap', 'G', branch)(AC, snap3, G3);
        ok((Number(G3._combatXpPending.attack) || 0) === 700,
          `THE LOSS: the settle_first branch discarded ${700 - (Number(G3._combatXpPending.attack) || 0)} attended XP on the refusal alone - the refusal paid nothing, so if the settle never lands that XP is gone`);
        ok(asked === 1,
          'the settle_first branch did not ASK for the settle it is being told to run first - a throttled tab is not running the 90 s cadence');
        // An UNCONFIRMED settle retires nothing...
        A.resolveCombatXpDeferral('unreachable', G3);
        ok((Number(G3._combatXpPending.attack) || 0) === 700,
          'an unconfirmed settle retired the deferred XP - nothing was paid, so the next flush must still be able to send it');
        // ...and a CONFIRMED one RE-SUBMITS it (S-1, 2026-09-17). The settle
        // stamped the span it just priced away; the server's top-up is reachable
        // only by a credit that arrives within 120 s, so the confirmed settle
        // must put the snapshot back and flush - dropping it here would leave the
        // stamp unclaimed and the window priced away forever (the server half
        // inert). No double credit: the top-up subtracts what the sim paid.
        G3._combatXpPending.attack = 0;                  // as if a drain had run
        let reflushed = 0;
        globalThis.window.hrCreditCombatXpFlush = (f) => { reflushed += (f === true ? 1 : 0); return Promise.resolve(null); };
        const restored = A.resolveCombatXpDeferral('accrued', G3);
        ok(restored === 700 && (Number(G3._combatXpPending.attack) || 0) === 700,
          `THE UNCLAIMED SPAN: a confirmed settle restored ${restored} XP and left ${G3._combatXpPending.attack} pending - the deferred snapshot must go back so the settle's span top-up can be claimed`);
        await A.combatXpReflushPromise();
        ok(reflushed === 1,
          'a confirmed settle did not fire the forced re-flush - the stamped span expires unclaimed after 120 s and the next settle NULLs it');
        delete globalThis.window.hrCreditCombatXpFlush;
        A.__resetCombatXpDeferral();
      }
    } finally {
      A.__resetAwaySettleLatch(false);
      if (prevWindow === undefined) delete globalThis.window; else globalThis.window = prevWindow;
      if (prevFetch === undefined) delete globalThis.fetch; else globalThis.fetch = prevFetch;
    }
  }

  return { ok: problems.length === 0, problems };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = await combatXpSettleFirstGuard();
  for (const p of r.problems) console.error('✗ ' + p);
  if (r.ok) console.log('combat-xp-settle-first: the credit cannot trim an unpaid away window (rule, settle and client ordering) — green');
  process.exit(r.ok ? 0 : 1);
}
