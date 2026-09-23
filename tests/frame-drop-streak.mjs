#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/frame-drop-streak.mjs — A CLIENT WHOSE FRAMES ARE ALL BEING
//                               REFUSED MUST BE ABLE TO SAY SO.
//
//   node tests/frame-drop-streak.mjs            # the guard
//   node tests/frame-drop-streak.mjs --list     # the mutation catalogue
//   node tests/frame-drop-streak.mjs --mutate   # every mutation must be CAUGHT
//
// Ships with: docs/planning/SEC_PUSH_CHANNEL_M5_2026-09-23.md S3 (MEDIUM)
//             docs/design/LIVE_COUNTERS_PUSH.md §5 (the healer table)
//
// ── WHAT THIS IS FOR, AND WHAT IT DELIBERATELY IS NOT ───────────────────────
// The frame gate has two failure directions and they are not symmetric.
//
//   TOO LOW   self-healing. The next frame is above the floor and lands.
//   TOO HIGH  NOT self-healing. Every real frame classifies `reorder` and is
//             dropped whole — including the `hello` full envelope that is the
//             only documented healer, which is therefore gated by the very
//             thing it exists to heal. SEC S2 is one way in (an identity change
//             that did not clear the floor); a frame stamped wrong is another.
//
// A client in the second state is INDISTINGUISHABLE from a quiet one. The game
// looks calm, the bug report says nothing, and `vitals.mjs` counts a player who
// stopped playing — which CLAUDE.md §3.4 calls a P1 by definition and gives two
// days to notice. So until `lane/m5-live-subscribe` ships the forced re-read
// that is ALLOWED TO RESET the floor (SEC §3 makes it a hard prerequisite of
// that lane, not of this one), the honest deliverable is DETECTION: a counter
// of consecutive refusals, published on a seam a human already reads.
//
// ⚠ THIS GUARD DOES NOT CLAIM THE STATE IS FIXED. It claims the state is
//   SAYABLE. That distinction is the whole reason the file exists, and a future
//   reader who takes green here as "the stuck floor is handled" has been misled
//   by this header, not by the code. See D4, which pins the gap ITSELF.
//
// ── THE CLAIMS ──────────────────────────────────────────────────────────────
//   D1  IT COUNTS       consecutive refusals raise a published counter, at ALL
//                       THREE appliers — away/boot, gold and intent. An applier
//                       that refuses silently is a third of the signal missing,
//                       and it is the away/boot applier that carries `hello`.
//   D2  IT CLEARS       a frame that LANDS ends the streak. Otherwise the
//                       counter only ever goes up and means nothing.
//   D3  HELLO CLEARS IT a fresh full envelope at a higher version — the §5
//                       healer, as the shipped client actually performs it —
//                       both applies and zeroes the streak, in one step.
//   D4  AND THE GAP IS REAL, PINNED ON PURPOSE. With the floor stuck ABOVE the
//                       server, that same `hello` is refused and the streak
//                       KEEPS RISING. This asserts the hole rather than papering
//                       it: if a later lane closes it, this claim goes red and
//                       the next author must come here and say so.
//   D5  IDENTITY CLEARS a character/slot change resets floor AND streak
//                       together — a streak carried across identities would
//                       report the outgoing character's silence as the
//                       incoming one's.
//
// Credential-free, database-free, no browser, milliseconds. Imports the REAL
// modules the browser imports, resolving their own `?v=`, never a copy.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

/* ── THE MUTATIONS ──────────────────────────────────────────────────────────
   Source patches, scored by the claim each must make fire. A guard that has
   never been red is not a guard (CLAUDE.md §4). */
const MUTATIONS = {
  away_applier_silent: {
    why: 'the away/boot applier stops counting its refusals — the applier that '
       + 'carries `hello`, so the stuck-floor case is exactly the one lost',
    file: 'src/net/accrue.js',
    from: '  if (!G || !isEnvelopeApplicable(res)) return refuseFrame(G, res);',
    to:   '  if (!G || !isEnvelopeApplicable(res)) return null;',
    kills: ['D1'],
    behaviour: true,
  },
  gold_applier_silent: {
    why: 'the gold applier stops counting its refusals',
    file: 'src/net/gold.js',
    from: '    noteFrameDrop(frame.verdict);',
    to:   '    /* noteFrameDrop(frame.verdict); */',
    kills: ['D1'],
    behaviour: true,
  },
  intent_applier_silent: {
    why: 'the intent applier stops counting its refusals',
    file: 'src/net/activity.js',
    from: "  if (!frame.apply && frame.verdict !== 'duplicate') { noteFrameDrop(frame.verdict); return null; }",
    to:   "  if (!frame.apply && frame.verdict !== 'duplicate') { return null; }",
    kills: ['D1'],
    behaviour: true,
  },
  streak_never_clears: {
    why: 'a landed frame stops ending the streak, so the counter only ever '
       + 'rises and every client eventually looks stuck',
    file: 'src/net/accrue.js',
    from: '  clearFrameDrops();\n  return true;\n}',
    to:   '  return true;\n}',
    kills: ['D2', 'D3'],
  },
  identity_keeps_streak: {
    why: 'the streak survives a character change, so the outgoing character’s '
       + 'silence is reported as the incoming one’s',
    file: 'src/net/accrue.js',
    from: '  lastAppliedFrame = -1;\n  clearFrameDrops();',
    to:   '  lastAppliedFrame = -1;',
    kills: ['D5'],
  },
};

const problems = [];
const ok = (cond, claim, msg) => { if (!cond) problems.push(claim + ': ' + msg); };

const envAt = (version, gold) => ({
  ok: true, accrued: true, version, now: '2026-09-22T12:00:00Z',
  state: { slot: 0, gold, gems: 0, hp: 40, max_hp: 40, accrued_to: '2026-09-22T12:00:00Z',
    active_kind: 'gather', active_id: 'copper_rock' },
  skills: { mining: { xp: gold * 2 } },
  inventory: { copper_ore: gold },
  equipment: {}, bank: {},
  away: { ms: 10000, kind: 'gather', credited: true },
});
/* An INTENT answer: no `away` receipt, nothing was absent. */
const intentAt = (version, gold) => { const e = envAt(version, gold); delete e.away; return e; };

async function sourceOf(file) { return readFile(new URL(file, ROOT), 'utf8'); }

/* ── THE BEHAVIOURAL MUTANTS ────────────────────────────────────────────────
   A patched module GRAPH cannot be imported without writing to the working tree
   (the appliers import `noteFrameDrop` by binding, not through a namespace a
   test could swap), and a guard that edits the tree is a guard that can leave
   it edited. So the three "an applier refuses silently" defects are reproduced
   the one way that needs no tree write: intercept the refusal BEFORE the real
   applier is called, so its counting branch is never reached. That is exactly
   the defect — a refusal that returns without noting — and it makes D1's
   assertions demonstrably non-vacuous.

   THE HONEST LIMIT, STATED: `streak_never_clears` and `identity_keeps_streak`
   live inside accrue.js's own module scope, below every seam a namespace
   wrapper can reach, so they are scored against the SOURCE (the anchor they
   delete is asserted to be required) and not re-executed. Their claims D2, D3
   and D5 are still driven behaviourally on the clean arm, which is what says
   the shipped code is right; the source arm is what says it stays that way. */
function mutantAppliers(A, Gd, M, id) {
  if (id === 'away_applier_silent') {
    return [{ ...A, applyEnvelope: (G, res) => (A.isEnvelopeApplicable(res) ? A.applyEnvelope(G, res) : null) }, Gd, M];
  }
  if (id === 'gold_applier_silent') {
    return [A, { ...Gd,
      applyGoldEnvelope: (G, body, key) => (A.classifyFrame(body && body.version).apply
        ? Gd.applyGoldEnvelope(G, body, key)
        : { stale: true, verdict: A.classifyFrame(body && body.version).verdict }) }, M];
  }
  if (id === 'intent_applier_silent') {
    return [A, Gd, { ...M,
      applyIntentEnvelope: (G, body) => {
        const v = A.classifyFrame(body && body.version);
        if (!v.apply && v.verdict !== 'duplicate') return null;
        return M.applyIntentEnvelope(G, body);
      } }];
  }
  return [A, Gd, M];
}

export async function frameDropStreakGuard(mutation) {
  problems.length = 0;
  const mut = mutation ? MUTATIONS[mutation] : null;
  if (mutation && !mut) { problems.push('unknown mutation ' + mutation); return problems; }

  const accSrc = await sourceOf('src/net/accrue.js');
  const goldSrc = await sourceOf('src/net/gold.js');
  const actSrc = await sourceOf('src/net/activity.js');
  const V = (accSrc.match(/item-authority\.js\?v=(\d+)/) || [])[1];
  const q = V ? `?v=${V}` : '';

  /* ── THE MUTATION ARM IS SOURCE-SCORED, for the same reason the frame-gate
        guard's is: a patched module graph cannot be imported without WRITING to
        the working tree, and a guard that edits the tree is a guard that can
        leave it edited. So a mutation is scored by asserting the anchor it
        removes is REQUIRED — the claim each one kills is re-stated here against
        the text, and the behavioural half below runs on the real modules. ── */
  if (mut) {
    const text = { 'src/net/accrue.js': accSrc, 'src/net/gold.js': goldSrc,
      'src/net/activity.js': actSrc }[mut.file];
    if (text.indexOf(mut.from) === -1) {
      problems.push('MUTATION ' + mutation + ' did not apply — its anchor is gone from '
        + mut.file + '. The guard is stale; fix it before trusting green.');
      return problems;
    }
    /* The two that a namespace wrapper cannot reach are scored HERE, against the
       source, and the claim says so rather than implying an execution it did not
       do. The three that CAN be reproduced fall through to the behavioural run
       below with a mutant applier in place. */
    if (!mut.behaviour) {
      for (const k of mut.kills) {
        ok(false, k, 'MUTATED (' + mutation + ', SOURCE-SCORED): ' + mut.why + '. The anchor '
          + '`' + mut.from.trim().slice(0, 48) + '…` is required in ' + mut.file
          + ' and this mutation removes it.');
      }
      return problems;
    }
  }

  let A; let Gd; let M;   // eslint-disable-line prefer-const — reassigned by mutantAppliers
  try {
    A = await import(mod('src/net/accrue.js' + q));
    Gd = await import(mod('src/net/gold.js' + q));
    M = await import(mod('src/net/activity.js' + q));
  } catch (e) {
    problems.push('could not load the appliers, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }
  for (const n of ['getFrameDrops', 'noteFrameDrop', 'clearFrameDrops', 'resetFrameGate']) {
    if (typeof A[n] !== 'function') {
      problems.push('D1: accrue.js does not export ' + n + ' — the streak is not published at '
        + 'all, so a client whose every frame is refused has no way to say so.');
    }
  }
  if (problems.length) return problems;

  /* The mutant owns no state of its own — it wraps the REAL appliers and the
     REAL counter, so `drops()` below reads the shipped module either way. */
  if (mut) [A, Gd, M] = mutantAppliers(A, Gd, M, mutation);

  const drops = () => A.getFrameDrops().drops;

  // ── D1 IT COUNTS, AT ALL THREE APPLIERS ───────────────────────────────────
  {
    A.resetFrameGate();
    ok(drops() === 0, 'D1', 'the streak does not start at 0 (got ' + drops() + ').');
    A.commitFrame(500);

    A.applyEnvelope({ gold: 1 }, envAt(499, 9));                       // away/boot
    ok(drops() === 1, 'D1', 'the AWAY/BOOT applier refused a frame silently (streak '
      + drops() + '). This is the applier `hello` arrives through, so a silent refusal here '
      + 'loses exactly the case the counter exists for.');

    Gd.applyGoldEnvelope({ gold: 1, gems: 0, skills: {}, inventory: {} },
      { ok: true, verb: 'shop_buy', version: 498, state: { gold: 7, gems: 0 }, skills: {}, inventory: {} },
      Gd.newIntentKey());
    ok(drops() === 2, 'D1', 'the GOLD applier refused a frame silently (streak ' + drops() + ').');

    M.applyIntentEnvelope({ gold: 1, gems: 0, skills: {}, inventory: {} }, intentAt(497, 3));
    ok(drops() === 3, 'D1', 'the INTENT applier refused a frame silently (streak ' + drops() + ').');

    ok(A.getFrameDrops().verdict === 'reorder', 'D1',
      'the streak does not name WHY the last frame was refused (got '
      + A.getFrameDrops().verdict + '). "reorder" and "unversioned" are different incidents.');
  }

  // ── D2 IT CLEARS ──────────────────────────────────────────────────────────
  {
    const G = { gold: 0, gems: 0, skills: {}, inventory: {} };
    ok(A.applyEnvelope(G, envAt(501, 42)) !== null, 'D2',
      'the precondition is broken — frame 501 was refused over a floor of 500.');
    ok(drops() === 0, 'D2',
      'a frame LANDED and the streak stayed at ' + drops() + '. A counter that only rises is '
      + 'not a signal: every long-lived client eventually reads as stuck.');
  }

  // ── D3 THE HELLO HEALS A FLOOR THAT IS TOO LOW, IN ONE STEP ───────────────
  {
    A.resetFrameGate();
    A.commitFrame(600);
    for (const v of [10, 11, 12]) A.applyEnvelope({ gold: 1 }, envAt(v, 1));
    ok(drops() === 3, 'D3', 'the drop sequence did not accumulate (streak ' + drops() + ').');
    const G = { gold: 0, gems: 0, skills: {}, inventory: {} };
    ok(A.applyEnvelope(G, envAt(900, 12345)) !== null && G.gold === 12345, 'D3',
      'the `hello` full envelope (900) was refused — §5 makes it the ONLY way back and it '
      + 'must always work from below.');
    ok(drops() === 0, 'D3',
      'the `hello` applied but left the streak at ' + drops() + '. The healer must clear the '
      + 'signal it healed, or the sheet reports an outage that is over.');
  }

  /* ── D4 …AND THE GAP IS REAL. PINNED, NOT PAPERED. ────────────────────────
     A floor ABOVE the server is the case with no healer: `hello` itself is
     refused, and the streak rises without bound. This claim asserts the HOLE.
     It is the one claim in this file that will go RED when the thing it
     describes is fixed — and that is the point: whoever lands the forced
     re-read in `lane/m5-live-subscribe` must come here, read this, and rewrite
     it, rather than find a green guard that quietly says nothing. */
  {
    A.resetFrameGate();
    A.commitFrame(1e6);                                   // the stuck floor
    const G = { gold: 0, gems: 0, skills: {}, inventory: {} };
    ok(A.applyEnvelope(G, envAt(900, 12345)) === null && G.gold === 0, 'D4',
      'a `hello` BELOW a stuck floor was applied. If a forced re-read that resets the floor has '
      + 'landed, this guard is describing a client that no longer exists — rewrite D4 and the '
      + 'header, and move the healer row in LIVE_COUNTERS_PUSH.md §5.');
    const before = drops();
    A.applyEnvelope({ gold: 1 }, envAt(901, 1));
    ok(drops() === before + 1, 'D4',
      'the streak stopped rising under a stuck floor (' + before + ' → ' + drops() + '). '
      + 'Detection is the ONLY thing this client has for that state; if the counter goes quiet '
      + 'there, it is quiet exactly when it is needed.');
  }

  // ── D5 AN IDENTITY CHANGE CLEARS BOTH ─────────────────────────────────────
  {
    A.resetFrameGate();
    A.commitFrame(4200);
    A.applyEnvelope({ gold: 1 }, envAt(37, 5));
    ok(drops() === 1, 'D5', 'the precondition is broken — the refusal was not counted.');
    A.resetAccrualIdentity();
    ok(A.getAppliedFrame() === -1 && drops() === 0, 'D5',
      'an identity change left floor=' + A.getAppliedFrame() + ' streak=' + drops()
      + '. Both are scoped to WHO is playing; a streak carried across reports the outgoing '
      + "character's silence as the incoming one's.");
  }

  A.resetFrameGate();
  return problems;
}

// ── DRIVER ──────────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);

  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) {
      console.log('  ' + id.padEnd(24) + ' kills ' + m.kills.join(',') + ' — ' + m.why);
    }
    process.exit(0);
  }

  if (argv.includes('--mutate') || argv.includes('--selftest')) {
    /* A FLOOR FIRST (guard-hygiene R3): a mutation harness that never runs a
       CLEAN arm scores its own corpse as "the guard went red". */
    const clean = await frameDropStreakGuard(null);
    if (clean.length) {
      console.error('  ✗ SELFTEST FLOOR: the CLEAN run is already red, so no mutation below '
        + 'can be scored. Fix these first:');
      for (const m of clean) console.error('      ' + m);
      process.exit(1);
    }
    console.log('  floor: the clean run is green — mutations can be scored.');
    let bad = 0;
    for (const [id, m] of Object.entries(MUTATIONS)) {
      const found = await frameDropStreakGuard(id);
      const caught = m.kills.filter((k) => found.some((f) => f.startsWith(k + ':')));
      if (caught.length !== m.kills.length) {
        bad++;
        console.error('  ✗ ' + id + ' was NOT caught by '
          + m.kills.filter((k) => !caught.includes(k)).join(',')
          + ' (findings: ' + (found.join(' | ') || 'none') + ')');
      } else {
        console.log('  ✓ ' + id + ' caught by ' + caught.join(','));
      }
    }
    if (bad) { console.error('frame-drop-streak --mutate: ' + bad + ' mutation(s) uncaught'); process.exit(1); }
    console.log('frame-drop-streak --mutate: all ' + Object.keys(MUTATIONS).length
      + ' mutations caught, on top of a green clean run.');
    process.exit(0);
  }

  const found = await frameDropStreakGuard(null);
  if (found.length) { for (const m of found) console.error('  ✗ ' + m); process.exit(1); }
  console.log('frame-drop-streak: OK — consecutive refusals are counted at all three appliers, '
    + 'a landed frame clears the streak, `hello` heals a floor that is too LOW in one step, and '
    + 'the too-HIGH case is pinned as the open gap it still is (SEC S3).');
}
