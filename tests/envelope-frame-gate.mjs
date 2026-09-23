#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/envelope-frame-gate.mjs — THE WHOLE ENVELOPE IS GATED ON ONE
//                                 MONOTONIC FRAME, IN ONE PLACE.
//
//   node tests/envelope-frame-gate.mjs             # the guard
//   node tests/envelope-frame-gate.mjs --list      # the mutation catalogue
//   node tests/envelope-frame-gate.mjs --selftest  # every mutation must be CAUGHT
//   node tests/envelope-frame-gate.mjs --mutate=<id>
//
// Ships with: docs/design/LIVE_COUNTERS_PUSH.md §7 (the decision that needs it)
//             docs/planning/WORLD_TICK_DESIGN.md §7.1 (the rule it enforces)
//
// ── WHAT WAS MEASURED, AND WHY IT IS A GUARD AND NOT A COMMENT ──────────────
// Before M5 the client had NO whole-frame version gate. `isEnvelopeApplicable`
// (src/net/accrue.js) asked only that `res.version` be a finite NUMBER, and the
// monotonic rule existed in exactly ONE place for exactly ONE field:
// src/net/gold.js's `if (env.version < lastVersion) return { stale: true … }`.
//
// Under request/response that is survivable: a response is the answer to a
// request this client just made, and the only reorder in the system is two gold
// verbs racing. Under the push stream M5 ships it is not survivable. Frames
// arrive unbidden, and a reorder, a duplicate or a late retransmit rewinds hp,
// the activity pointer, the bag, a buff clock and a plot tier — silently, and
// at the cadence of the world tick instead of the cadence of a reload. That is
// the 2026-09-13 "browser says X, server says Y" class (CLAUDE.md §6), which is
// a P1 CLASS-KILL and not a bug.
//
// ── THE CLAIMS ─────────────────────────────────────────────────────────
//   F1  REORDER      a frame below the floor is refused, and NOTHING is written
//   F2  DUPLICATE    a frame EQUAL to the floor never ADVANCES the gate:
//                    `isEnvelopeApplicable` is false and the floor stays put.
//                    Strictly greater, for everything that is a step forward.
//   F6  CORRECTION   …and yet the INTENT applier RE-APPLIES that equal frame,
//                    absolutely, because a REFUSAL arrives there: the server
//                    wrote nothing, so `player_state.version` did not move, and
//                    dropping it leaves the caller's optimistic write standing
//                    over a server that never took it (CLAUDE.md §6). A REORDER
//                    is still dropped, the floor is still not raised, and the
//                    collect RECEIPT is not re-hung — state replays clean, an
//                    event does not. SEC_PUSH_CHANNEL_M5_2026-09-23.md S1.
//   F3  WHOLE FRAME  a refused frame writes no key at all — no per-key merge,
//                    no "apply the newer fields". This is the claim a naive
//                    fix gets wrong, and the one that matters most: a per-key
//                    merge produces a state the server never held.
//   F4  LATE RETRANS a frame that was fresh when SENT and is stale when it
//                    ARRIVES is refused on arrival, not on its own timestamp.
//   F5  HELLO HEALS  a fresh full envelope after a drop restores the client in
//                    one step, and the floor jumps to it. §7.1's reconnect rule.
//
//   S1  ONE AUTHORITY  gold.js holds no second monotonic rule. The `lastVersion`
//                      binding is GONE, not shadowed — two floors are two
//                      answers to "is this frame stale", and the away applier's
//                      silence was the gap that made the old one half a rule.
//   S2  THREE APPLIERS every module that writes a server envelope commits the
//                      frame it wrote. A writer that does not commit leaves the
//                      floor BELOW the state in `G`, after which a genuinely
//                      older frame reads as fresh — a gate that looks present
//                      and is wrong.
//   S4  STRICTLY >     the shipped comparison is `>` and `===`, not `>=`. The
//                      pre-M5 gold rule restored one level up is the single
//                      most likely regression here, because `>=` looks right.
//   S5  ONE GATE       applyEnvelope's only frame decision is the one gate at
//                      the top, and nothing between it and applyEnvelopeState
//                      writes into G. A per-key merge bolted on below the gate
//                      passes every behavioural claim about the RETURN value.
//   S6  CORRECTION     activity.js's gate lets a `duplicate` through and still
//                      refuses a `reorder`, and its collect receipt is
//                      suppressed on that arm. Dropping both again is the
//                      SEC S1 defect, and it is invisible to every claim
//                      about the RETURN value.
//   S7  IDENTITY RESET the floor is cleared by `resetAccrualIdentity()`, the
//                      hook BOTH production identity changes already run
//                      (auth.js signOut, which does not reload; and
//                      multi-character.js, before the pointer moves). A reset
//                      wired only to `resetGold()` — which has no production
//                      caller — is a comment, not a seam, and the suite's own
//                      call proves nothing about it.
//   S3  SHAPE ≠ FRAME  classifyAccrueResponse keeps classifying on SHAPE. If
//                      the frame gate lived there, a duplicate would classify
//                      `malformed` and three of them would trip
//                      ACCRUE_HALT_AFTER_TRIES — the b475 shape, and under a
//                      push stream the "Away progress is paused" sheet would be
//                      permanent.
//
// ── WHAT THE PROOF IS, IN TWO HALVES, STATED SO NEITHER IS OVERSOLD ─────────
// The F claims are BEHAVIOURAL: they drive the real, shipped, unmutated modules
// and they are what says the code is right today. The S claims are SOURCE claims
// about the tree, and they are what the mutations bite — because a mutated
// module graph cannot be imported without WRITING to the working tree, and a
// guard that edits the tree is a guard that can leave it edited. So:
//
//   · a defect in the shipped code    -> caught by the F claims (the plain run)
//   · a defect re-introduced later    -> caught by the S claims (the plain run)
//   · "can this guard go red at all"  -> --selftest, which patches the source
//                                        text of the real files in memory and
//                                        requires each named claim to fire.
//
// The honest limitation: --selftest proves the SOURCE claims bite. It re-runs a
// behavioural claim only where a MUTANT of the shipped function exists
// (`mutantGate`, `mutantIntent`), and it does not pretend otherwise. That is why
// S4, S5 and S6 exist at all — they pin, in the tree, the behaviours a source
// mutation can reach but a re-import cannot.
//
// Credential-free, database-free, no browser, milliseconds. It imports the REAL
// modules the browser imports (resolving accrue.js's own `?v=`), never a copy.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

/* ── THE MUTATIONS ──────────────────────────────────────────────────────────
   Each patches the REAL source in memory, re-imports it under a cache-busting
   query, and must be CAUGHT by a named claim. A guard that has never been red
   is not a guard (CLAUDE.md §4). */
const MUTATIONS = {
  equal_accepted: {
    why: 'the gate goes back to `>=` — an EQUAL frame is applied, i.e. the '
       + 'pre-M5 gold rule (`version < floor`) restored one level up',
    file: 'src/net/accrue.js',
    from: "  if (v > floor) return { apply: true, verdict: 'fresh', frame: v, current: floor };\n"
        + "  if (v === floor) return { apply: false, verdict: 'duplicate', frame: v, current: floor };",
    to:   "  if (v >= floor) return { apply: true, verdict: 'fresh', frame: v, current: floor };\n"
        + "  if (v === floor - 1e9) return { apply: false, verdict: 'duplicate', frame: v, current: floor };",
    kills: ['S4', 'F2'],
    /* ALSO a behavioural mutant (see mutantGate): the source patch pins the
       tree, the mutant gate proves F2's assertions are not vacuous. */
    behaviour: true,
  },
  per_key_merge: {
    why: 'the applier stops refusing the WHOLE frame and instead merges the '
       + 'keys a stale frame happens to carry — the fix a hurried author writes',
    file: 'src/net/accrue.js',
    from: 'export function applyEnvelope(G, res) {\n  if (!G || !isEnvelopeApplicable(res)) return refuseFrame(G, res);',
    to:   'export function applyEnvelope(G, res) {\n'
        + '  if (!G || !isEnvelopeShapeComplete(res)) return null;\n'
        + '  if (!classifyFrame(res.version).apply) { try { G.gold = Number(res.state.gold); } catch (e) {} return null; }',
    kills: ['S5', 'F3'],
    behaviour: true,
  },
  gold_copy_restored: {
    why: "gold.js grows its own floor back — a SECOND authority for the same "
       + 'question, which is what M5 deleted',
    file: 'src/net/gold.js',
    from: 'export function resetGold() { pending = []; last = null; resetFrameGate(); }',
    to:   'let lastVersion = -1;\n'
        + 'export function resetGold() { pending = []; last = null; lastVersion = -1; resetFrameGate(); }',
    kills: ['S1'],
  },
  activity_does_not_commit: {
    why: 'the third applier writes the envelope but never raises the floor, so '
       + 'the floor sits below the state actually in G',
    file: 'src/net/activity.js',
    from: '  commitFrame(env.version);\n  /* SEC S3 — and the streak ends',
    to:   '  /* SEC S3 — and the streak ends',
    kills: ['S2'],
  },
  duplicate_dropped: {
    why: 'the intent applier goes back to dropping a DUPLICATE as well as a '
       + 'reorder — the shape that left a REFUSAL uncorrected on screen '
       + '(SEC_PUSH_CHANNEL_M5_2026-09-23.md S1)',
    file: 'src/net/activity.js',
    from: "  if (!frame.apply && frame.verdict !== 'duplicate') { noteFrameDrop(frame.verdict); return null; }",
    to:   '  if (!frame.apply) { noteFrameDrop(frame.verdict); return null; }',
    kills: ['S6', 'F6'],
    /* ALSO behavioural: the mutant re-runs F6 against a gate broken the same
       way, which is what says F6's assertions are not vacuous. */
    behaviour: true,
  },
  identity_reset_missing: {
    why: 'the frame floor stops being reset on an identity change — the shape '
       + 'that let a signed-in account B inherit account A\'s floor and have '
       + 'every one of its frames dropped for the whole session '
       + '(SEC_PUSH_CHANNEL_M5_2026-09-23.md S2)',
    file: 'src/net/accrue.js',
    from: '  resetFrameGate();\n  try { clearFall(); } catch (e) {}',
    to:   '  try { clearFall(); } catch (e) {}',
    kills: ['S7'],
  },
  classify_gates_on_frame: {
    why: 'the frame gate is moved INTO classifyAccrueResponse, so a duplicate '
       + 'classifies `malformed` and three of them halt the accrual loop',
    file: 'src/net/accrue.js',
    from: '      return isEnvelopeShapeComplete(b)\n'
        + "        ? { outcome: 'accrued', body: b }",
    to:   '      return isEnvelopeApplicable(b)\n'
        + "        ? { outcome: 'accrued', body: b }",
    kills: ['S3'],
  },
};

const problems = [];
const ok = (cond, claim, msg) => { if (!cond) problems.push(claim + ': ' + msg); };

/* ── THE BEHAVIOURAL MUTANTS ────────────────────────────────────────────────
   A mutated module graph cannot be imported without writing to the working
   tree, so F1-F5 cannot be re-run against patched SOURCE. They can, however, be
   re-run against a gate that is deliberately broken IN THE SAME WAY — which is
   what proves the assertions are not vacuous. This is the narrower claim and it
   is stated as such: the mutant proves THE TEST bites, the source claims S4/S5
   prove THE TREE still holds. Neither alone is the proof. */
function mutantGate(A, id) {
  if (id === 'equal_accepted') {
    /* `>=` — the pre-M5 gold rule (`version < floor` is stale) written one
       level up. It reads as "apply anything at least as new" and it re-applies
       every duplicate. */
    let floor = -1;
    const classifyFrame = (version, since) => {
      const f = Number.isFinite(Number(since)) ? Number(since) : floor;
      const v = Number(version);
      if (!Number.isFinite(v)) return { apply: false, verdict: 'unversioned', frame: null, current: f };
      if (v >= f) return { apply: true, verdict: 'fresh', frame: v, current: f };
      return { apply: false, verdict: 'reorder', frame: v, current: f };
    };
    const commitFrame = (v) => { const n = Number(v);
      if (!Number.isFinite(n) || n <= floor) return false; floor = n; return true; };
    const isEnvelopeApplicable = (res, since) =>
      A.isEnvelopeShapeComplete(res) && classifyFrame(res.version, since).apply;
    return { ...A, classifyFrame, commitFrame, isEnvelopeApplicable,
      resetFrameGate: () => { floor = -1; return floor; },
      getAppliedFrame: () => floor,
      applyEnvelope: (G, res) => {
        if (!G || !isEnvelopeApplicable(res)) return null;
        return A.applyEnvelope(G, res);
      } };
  }
  if (id === 'per_key_merge') {
    /* The fix a hurried author writes: refuse the frame, but keep the keys it
       "obviously" carries. It returns null, so every assertion about the RETURN
       value still passes — and the state in G is now a fiction assembled from
       two frames that the server never held together. */
    return { ...A, applyEnvelope: (G, res) => {
      if (!G || !A.isEnvelopeShapeComplete(res)) return null;
      if (!A.classifyFrame(res.version).apply) {
        try { G.gold = Number(res.state.gold); } catch (e) {}
        return null;
      }
      return A.applyEnvelope(G, res);
    } };
  }
  return A;
}

/* The same device for the THIRD applier, which lives in its own module and is
   reached through its own export. The mutant re-imposes the gate this lane
   removed — `!frame.apply` alone, dropping duplicate and reorder together —
   over the real applier, so F6 is scored against code broken exactly the way
   the shipped code was broken before the fix. */
function mutantIntent(M, A, id) {
  if (id !== 'duplicate_dropped') return M;
  return { ...M, applyIntentEnvelope: (G, body) => {
    const env = M.envelopeOf(body);
    if (!G || typeof G !== 'object' || !env) return null;
    if (!A.classifyFrame(env.version).apply) return null;
    return M.applyIntentEnvelope(G, body);
  } };
}

/* ── THE ENVELOPE FIXTURES ──────────────────────────────────────────────────
   Constructed to the SHAPE the client gate requires (ok/accrued/state/skills/
   inventory/away/version), so every refusal below is the FRAME rule biting and
   never the shape rule. */
const envelopeAt = (version, gold, extra) => ({
  ok: true, accrued: true, version, now: '2026-09-22T12:00:00Z',
  state: { gold, hp: 40, max_hp: 40, accrued_to: '2026-09-22T12:00:00Z',
    active_kind: 'gather', active_id: 'copper_rock', slot: 0 },
  skills: { mining: { xp: gold * 2 } },
  inventory: { copper_ore: gold },
  equipment: {}, bank: {}, progress: [],
  away: { ms: 10000, kind: 'gather', credited: true },
  ...(extra || {}),
});

/* An INTENT answer, which is a different body from an accrue envelope: no
   `away` receipt (nothing was absent), and `envelopeOf` in activity.js requires
   only state/skills/inventory + a finite version. A REFUSAL is this same shape
   at a version the server did not move — that is the whole of the S1 repro. */
const intentAt = (version, gold) => ({
  ok: true, accrued: true, version, now: '2026-09-22T12:00:00Z',
  state: { gold, hp: 40, max_hp: 40, accrued_to: '2026-09-22T12:00:00Z',
    active_kind: 'gather', active_id: 'copper_rock', slot: 0 },
  skills: { mining: { xp: gold * 2 } },
  inventory: { copper_ore: 1 },
  equipment: {}, bank: {}, progress: [],
});

/* activity.js is imported by the browser through its own `?v=`, and this guard
   imports the REAL module and never a copy — so the query is READ from the tree
   rather than written into this file, where it would rot at the next bump. */
let ACT_V = '';

async function loadAccrue(patches) {
  const raw = await readFile(new URL('src/net/accrue.js', ROOT), 'utf8');
  const m = raw.match(/item-authority\.js\?v=(\d+)/);
  const v = m ? `?v=${m[1]}` : '';
  if (!patches) return import(mod('src/net/accrue.js' + v));
  return null; // mutated modules are loaded by mutateLoad below
}

/* A mutated module graph. accrue.js is imported by gold.js and activity.js
   through a `?v=` query, so a patched TREE has to be written to disk to be
   importable — which this guard refuses to do (a guard that edits the working
   tree is a guard that can leave it edited). Instead the mutation is applied to
   the SOURCE TEXT and the claim it kills is re-evaluated against that text plus
   a re-import of an isolated copy. Both halves are stated per claim below. */
async function sourceOf(file) { return readFile(new URL(file, ROOT), 'utf8'); }

function applyMutation(text, mut) {
  if (text.indexOf(mut.from) === -1) return null;
  return text.split(mut.from).join(mut.to);
}

export async function envelopeFrameGateGuard(mutation) {
  problems.length = 0;
  const mut = mutation ? MUTATIONS[mutation] : null;
  if (mutation && !mut) { problems.push('unknown mutation ' + mutation); return problems; }

  // ── Load the REAL client gate. ────────────────────────────────────────────
  let A;
  try {
    A = await loadAccrue(null);
  } catch (e) {
    problems.push('could not load accrue.js, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }
  const need = ['isEnvelopeApplicable', 'isEnvelopeShapeComplete', 'classifyFrame',
    'commitFrame', 'resetFrameGate', 'getAppliedFrame', 'applyEnvelope', 'classifyAccrueResponse'];
  for (const n of need) {
    if (typeof A[n] !== 'function' && n !== 'FRAME_VERDICTS') {
      problems.push('accrue.js does not export ' + n + ' — the frame gate is not installed');
    }
  }
  if (problems.length) return problems;

  /* ── SOURCE-LEVEL CLAIMS. These are the ones a mutation can reach without a
        writable tree, and they are also the ones that would otherwise rot into
        a comment: "one authority" and "every applier commits" are facts about
        the TREE, not about one function's return value. ──────────────────── */
  let goldSrc = await sourceOf('src/net/gold.js');
  let actSrc = await sourceOf('src/net/activity.js');
  let accSrc = await sourceOf('src/net/accrue.js');
  /* Resolved from the tree, not hard-coded: activity.js's own imports carry the
     build's `?v=`, and F6 must import the module the BROWSER imports. */
  {
    const m = actSrc.match(/accrue\.js\?v=(\d+)/);
    ACT_V = m ? `?v=${m[1]}` : '';
  }
  if (mut) {
    const target = { 'src/net/gold.js': () => goldSrc, 'src/net/activity.js': () => actSrc,
      'src/net/accrue.js': () => accSrc }[mut.file];
    const patched = applyMutation(target(), mut);
    if (patched === null) {
      problems.push('MUTATION ' + mutation + ' did not apply — its anchor is gone from '
        + mut.file + '. The guard is stale; fix it before trusting green.');
      return problems;
    }
    if (mut.file === 'src/net/gold.js') goldSrc = patched;
    else if (mut.file === 'src/net/activity.js') actSrc = patched;
    else accSrc = patched;
  }

  // S1 — gold.js holds no second floor. A COMMENT naming it is fine; a binding
  //      is not. This is why the test is `let|const|var lastVersion` and not a
  //      bare grep: the file deliberately keeps the name in its own headstone.
  const goldBinding = /(?:^|\n)\s*(?:let|const|var)\s+lastVersion\b/.test(goldSrc);
  ok(!goldBinding, 'S1', 'src/net/gold.js declares `lastVersion` again — a SECOND monotonic '
    + 'authority for the same question. The floor lives in accrue.js and nowhere else.');
  ok(/classifyFrame/.test(goldSrc) && /commitFrame/.test(goldSrc), 'S1',
    'src/net/gold.js no longer reads the shared frame gate (classifyFrame/commitFrame).');

  // S2 — every applier of a server envelope commits the frame it wrote.
  ok(/commitFrame\(res\.version\)/.test(accSrc), 'S2',
    'accrue.js applyEnvelope does not commit the frame it applied.');
  ok(/commitFrame\(env\.version\)/.test(goldSrc), 'S2',
    'gold.js applyGoldEnvelope does not commit the frame it applied.');
  ok(/commitFrame\(env\.version\)/.test(actSrc), 'S2',
    'activity.js applyIntentEnvelope does not commit the frame it applied — the floor '
    + 'would sit BELOW the state in G, after which an older frame reads as fresh.');
  ok(/const frame = classifyFrame\(env\.version\);\n  if \(!frame\.apply && frame\.verdict !== 'duplicate'\) \{ noteFrameDrop\(frame\.verdict\); return null; \}/.test(actSrc), 'S2',
    'activity.js applyIntentEnvelope does not GATE on the frame it is about to write.');

  /* S6 — THE CORRECTION ARM, IN THE TREE. The behavioural claim F6 drives the
     applier and catches the drop on the path it drives; this pins the two
     halves a future edit is most likely to get wrong separately. The gate must
     let `duplicate` THROUGH (S1: a refusal arrives at the floor and is the only
     thing that retires the caller's optimistic write) and must still refuse a
     `reorder` (that one WOULD be a rewind) — and the collect receipt must be
     suppressed on the duplicate arm, because legacy.js credits away kills from
     `written.paidReceipt` into the Muster's SHARED meter and a retransmit that
     re-hung it would pay a shared surface twice. */
  ok(/frame\.verdict !== 'duplicate'/.test(actSrc), 'S6',
    "activity.js applyIntentEnvelope drops a DUPLICATE again. A refusal writes nothing "
    + 'server-side, so its correcting envelope arrives at `=== floor`; dropping it leaves the '
    + "caller's optimistic write on screen over a server that never took it (CLAUDE.md §6).");
  ok(/const duplicate = frame\.verdict === 'duplicate';/.test(actSrc), 'S6',
    'activity.js no longer names the duplicate arm, so nothing downstream can suppress the '
    + 'non-idempotent half of the apply.');
  ok(/const collected = duplicate \? null : collectedOf\(body\);/.test(actSrc), 'S6',
    'activity.js re-hangs the COLLECT RECEIPT on a duplicate. `written.paidReceipt` is replayed '
    + "by legacy.js's creditServerAwayKills into updateDaily('kill_any') — the Muster's SHARED "
    + 'world-event meter — so a retransmit would contribute to a shared surface twice.');

  /* S7 — THE RESET HAS A PRODUCTION CALL SITE. This is a claim about the TREE
     and it cannot be anything else: a reset the suite calls and production does
     not is green on every behavioural test ever written, because the suite is
     what wires it. The floor is module state that outlives a sign-out (auth.js
     does not reload), so an identity change that does not clear it hands the
     incoming character the outgoing character's floor — and every frame below
     it is dropped, for the whole session, with no healer (S3). */
  {
    const head = accSrc.indexOf('export function resetAccrualIdentity() {');
    const body = head < 0 ? '' : accSrc.slice(head, accSrc.indexOf('\n}', head));
    ok(head >= 0, 'S7', 'resetAccrualIdentity is gone from accrue.js — the identity teardown '
      + 'both production paths call cannot be checked.');
    ok(/(^|\n)\s*resetFrameGate\(\);/.test(body), 'S7',
      'resetAccrualIdentity() does not reset the frame floor. It is the ONE hook both production '
      + 'identity changes run (auth.js signOut — which does NOT reload — and multi-character.js '
      + 'before the pointer moves); resetGold() has no production caller, so a reset that lives '
      + 'only there is wired to the suite and to nothing else.');
  }

  /* S4 — STRICTLY GREATER, in the tree. `>=` is the regression that looks
     right: it reads as "apply anything at least as new", which is exactly the
     pre-M5 gold rule (`version < floor` is stale) written one level up. Under a
     push stream it re-applies every duplicate, and a duplicate that arrives
     after a newer frame has landed is a rewind wearing an equals sign. */
  ok(/if \(v > floor\) return \{ apply: true, verdict: 'fresh'/.test(accSrc), 'S4',
    "accrue.js classifyFrame no longer compares with a STRICT `v > floor`. §7.1 is "
    + 'strictly greater; equal is a duplicate and is dropped.');
  ok(/if \(v === floor\) return \{ apply: false, verdict: 'duplicate'/.test(accSrc), 'S4',
    'accrue.js classifyFrame no longer refuses an EQUAL frame as a duplicate.');

  /* S5 — ONE GATE, and nothing writes below it. The behavioural claim F3 reads
     `G` after a refused frame, so it catches a merge that happens on the path
     it drives — but an applier could grow a merge on a branch F3 does not
     reach, and every behavioural assertion about the RETURN value would still
     pass. This pins the shape instead: the gate is the first statement, and the
     only write to G between it and applyEnvelopeState is none. */
  {
    const head = accSrc.indexOf('export function applyEnvelope(G, res) {');
    const body = head < 0 ? '' : accSrc.slice(head, accSrc.indexOf('applyEnvelopeState(G, res)', head));
    ok(head >= 0, 'S5', 'applyEnvelope is gone from accrue.js — the one gate cannot be checked.');
    ok(/^export function applyEnvelope\(G, res\) \{\n  if \(!G \|\| !isEnvelopeApplicable\(res\)\) return refuseFrame\(G, res\);/.test(body), 'S5',
      "applyEnvelope's first statement is no longer the single `isEnvelopeApplicable` gate. "
      + 'Splitting the shape and frame halves HERE is how a per-key merge gets in. (The gate '
      + 'answers through `refuseFrame`, which counts the drop and returns null — one statement, '
      + 'one gate, both halves still asked together.)');
    ok(!/\bG\.[a-zA-Z_]+\s*=/.test(body), 'S5',
      'applyEnvelope writes into G between the frame gate and applyEnvelopeState — a refused '
      + 'frame must write NO key at all. Found: '
      + (body.match(/\bG\.[a-zA-Z_]+\s*=[^;]*/g) || []).join(' | '));
  }

  // S3 — the shape half and the frame half are different questions.
  ok(/return isEnvelopeShapeComplete\(b\)/.test(accSrc), 'S3',
    'classifyAccrueResponse gates on the FRAME. A duplicate would then classify `malformed`, '
    + 'and three of them trip ACCRUE_HALT_AFTER_TRIES — b475 with a permanent sheet.');

  /* ── BEHAVIOURAL CLAIMS. Driven against the REAL, unmutated module: the
        source mutations above cannot be loaded without writing to the tree, so
        each one is scored by the source claim it breaks. The behavioural half
        is what proves the shipped code is RIGHT; the source half is what proves
        it stays that way. ─────────────────────────────────────────────────── */
  const gate = (mut && mut.behaviour) ? mutantGate(A, mutation) : A;
  const { isEnvelopeApplicable, classifyFrame, commitFrame, resetFrameGate,
    getAppliedFrame, applyEnvelope, classifyAccrueResponse } = gate;

  // ── F1 REORDER ────────────────────────────────────────────────────────────
  resetFrameGate();
  ok(isEnvelopeApplicable(envelopeAt(10, 100)) === true, 'F1',
    'a first frame (10) against an empty floor was refused.');
  commitFrame(10);
  ok(getAppliedFrame() === 10, 'F1', 'the floor did not move to 10 after commitFrame(10).');
  ok(isEnvelopeApplicable(envelopeAt(9, 1)) === false, 'F1',
    'frame 9 was ACCEPTED after frame 10 — a reorder is a silent rewind.');
  ok(classifyFrame(9).verdict === 'reorder', 'F1',
    'frame 9 below floor 10 did not classify as `reorder` (got '
    + classifyFrame(9).verdict + ').');
  ok(commitFrame(9) === false && getAppliedFrame() === 10, 'F1',
    'commitFrame(9) moved the floor BACKWARDS — it must be raise-only.');

  // ── F2 DUPLICATE ──────────────────────────────────────────────────────────
  ok(isEnvelopeApplicable(envelopeAt(10, 999)) === false, 'F2',
    'frame 10 was accepted TWICE. §7.1 is STRICTLY greater; equal is a duplicate.');
  ok(classifyFrame(10).verdict === 'duplicate', 'F2',
    'an equal frame did not classify as `duplicate` (got ' + classifyFrame(10).verdict + ').');

  // ── F3 WHOLE FRAME OR NOTHING ─────────────────────────────────────────────
  //     The claim a per-key merge gets wrong. Drive the REAL applier.
  {
    const G = { gold: 500, inventory: { copper_ore: 7 }, skills: { mining: { xp: 300 } } };
    const before = JSON.stringify(G);
    const wrote = applyEnvelope(G, envelopeAt(9, 1));   // 9 < floor 10
    ok(wrote === null, 'F3', 'applyEnvelope returned a receipt for a REORDERED frame.');
    ok(JSON.stringify(G) === before, 'F3',
      'a refused frame wrote into G anyway — the whole frame must be applied or the whole '
      + 'frame dropped, with no per-key merge. G was ' + before + ', is now ' + JSON.stringify(G));
    ok(getAppliedFrame() === 10, 'F3', 'a refused frame moved the floor.');
  }

  // ── F4 LATE RETRANSMIT ────────────────────────────────────────────────────
  //     Fresh when sent (11 > 10), stale when it arrives (frames 12, 13 landed
  //     first). The rule is evaluated ON ARRIVAL and nowhere else.
  {
    resetFrameGate();
    commitFrame(10);
    const inFlight = envelopeAt(11, 110);              // stamped when floor was 10
    ok(isEnvelopeApplicable(inFlight) === true, 'F4',
      'frame 11 was refused while the floor was still 10 — the precondition is broken.');
    commitFrame(12); commitFrame(13);                   // two newer frames overtake it
    ok(isEnvelopeApplicable(inFlight) === false, 'F4',
      'a late retransmit of frame 11 was applied after 13 landed. The verdict is a '
      + 'function of the floor at ARRIVAL, never of when the frame was stamped.');
    const G = { gold: 500 };
    applyEnvelope(G, inFlight);
    ok(G.gold === 500, 'F4', 'the late retransmit wrote gold anyway (' + G.gold + ').');
  }

  // ── F5 HELLO HEALS ────────────────────────────────────────────────────────
  //     §7.1: a client that wants certainty asks again and gets a full envelope.
  //     One step, and the floor jumps to it — no hole to patch, no replay.
  {
    const G = { gold: 500, inventory: {}, skills: {} };
    const hello = envelopeAt(42, 777);
    ok(isEnvelopeApplicable(hello) === true, 'F5',
      'a fresh full envelope (42) after the drop sequence was refused — the reconnect '
      + 'healer is the ONLY way back from a missed frame and it must always work.');
    commitFrame(42);
    ok(getAppliedFrame() === 42, 'F5', 'the floor did not jump to the hello envelope.');
    ok(isEnvelopeApplicable(envelopeAt(41, 1)) === false, 'F5',
      'a frame from before the hello was accepted after it.');
    ok(isEnvelopeApplicable(envelopeAt(43, 800)) === true, 'F5',
      'the next real frame after a hello was refused — the gate latched shut.');
  }

  // ── F5b THE POISONED FRAME ────────────────────────────────────────────────
  //     Infinity is `> floor` for every finite floor, so a single garbage frame
  //     would latch the gate shut against every real frame afterwards. Fail
  //     closed on an unorderable version, in the direction that keeps playing.
  {
    resetFrameGate();
    commitFrame(50);
    for (const bad of [Infinity, NaN, undefined, null, 'soon', {}]) {
      ok(classifyFrame(bad).apply === false, 'F5',
        'an unorderable version (' + String(bad) + ') was accepted as a frame.');
      ok(commitFrame(bad) === false, 'F5',
        'commitFrame accepted an unorderable version (' + String(bad) + ').');
    }
    ok(getAppliedFrame() === 50, 'F5', 'a garbage frame moved the floor.');
    ok(isEnvelopeApplicable(envelopeAt(51, 5)) === true, 'F5',
      'the gate latched shut after a garbage frame — the real frame behind it was refused.');
  }

  /* ── F6 THE REFUSAL CORRECTS ───────────────────────────────────────────────
     SEC_PUSH_CHANNEL_M5_2026-09-23.md §1.1, verbatim, against the REAL intent
     applier. A refused intent writes nothing server-side, so its envelope
     arrives at the floor; the client is carrying an optimistic value on top of
     the last applied frame, and this envelope is the only thing that will ever
     take it off. Driven through activity.js and not through a re-implementation
     — the defect was in the applier, so the applier is what is driven. */
  {
    const M = mutantIntent(await import(mod('src/net/activity.js' + ACT_V)), A, mutation);
    A.resetFrameGate();
    const G = {};
    const wrote = M.applyIntentEnvelope(G, intentAt(77, 100));
    ok(!!wrote && G.gold === 100 && A.getAppliedFrame() === 77, 'F6',
      'the first intent envelope (77) did not land — the precondition is broken. gold='
      + G.gold + ' floor=' + A.getAppliedFrame());

    G.gold = 40;                                   // the player taps; the client predicts
    const corrected = M.applyIntentEnvelope(G, intentAt(77, 100));   // the server REFUSES
    ok(G.gold === 100, 'F6',
      'A REFUSAL AT THE FLOOR DID NOT CORRECT THE CLIENT. The browser shows ' + G.gold
      + ' and the server holds 100 — CLAUDE.md §6, the class this gate exists to kill. '
      + 'A duplicate must RE-APPLY in the intent applier; only a reorder is dropped.');
    ok(corrected !== null, 'F6',
      'the correcting envelope returned null, so legacy.js’s applyServerEnvelope stops at '
      + '`if(!written) return null` — no saveLocal, no refreshAll, and the stale number stays '
      + 'painted even if G were right.');
    ok(corrected && corrected.correction === true, 'F6',
      'the receipt does not name itself a correction, so nothing downstream can tell a '
      + 're-statement of the floor from a step forward.');
    ok(A.getAppliedFrame() === 77, 'F6',
      'the duplicate RAISED the floor (now ' + A.getAppliedFrame() + '). commitFrame is '
      + 'raise-only for exactly this reason; a duplicate re-applies and advances nothing.');

    // …and the receipt half is NOT replayed. A shared surface is paid once.
    ok(!(corrected && corrected.paidReceipt), 'F6',
      'a duplicate re-hung the collect receipt. legacy.js replays `paidReceipt` into '
      + "updateDaily('kill_any') — the Muster's SHARED world-event meter — so a retransmit "
      + 'would contribute to another player-visible surface twice (CLAUDE.md §1).');

    // A REORDER is still dropped whole: that one really would be a rewind.
    G.gold = 40;
    const older = M.applyIntentEnvelope(G, intentAt(70, 1));
    ok(older === null && G.gold === 40, 'F6',
      'a REORDERED intent envelope (70 < 77) was applied. The correction arm is for an EQUAL '
      + 'frame only — a lower one carries state the server has already moved past. G.gold='
      + G.gold);
    ok(A.getAppliedFrame() === 77, 'F6', 'a reordered intent envelope moved the floor.');
    A.resetFrameGate();
  }

  // ── S3 behavioural half — a duplicate is not an outage ────────────────────
  {
    resetFrameGate();
    commitFrame(100);
    const dup = envelopeAt(100, 42);
    const v = classifyAccrueResponse(200, dup);
    ok(v.outcome === 'accrued', 'S3',
      'a duplicate frame classified as `' + v.outcome + '`. classifyAccrueResponse reports what '
      + 'the SERVER said; a duplicate is a well-formed answer, and classifying it `malformed` '
      + 'trips ACCRUE_HALT_AFTER_TRIES after three of them.');
    ok(gate.isAccrualFailure(v.outcome) === false, 'S3',
      'a duplicate frame counts as an accrual FAILURE, which halts the settle loop.');
    // …and the applier is still what refuses it.
    const G = { gold: 1 };
    ok(applyEnvelope(G, dup) === null && G.gold === 1, 'S3',
      'the applier did not refuse the duplicate that classify deliberately let through.');
    // The shape half is unchanged: a body with no `away` is still malformed.
    const noAway = { ...envelopeAt(101, 5) }; delete noAway.away;
    ok(classifyAccrueResponse(200, noAway).outcome === 'malformed', 'S3',
      'an envelope with no away receipt stopped classifying as malformed (b475 regression).');
  }

  resetFrameGate();
  /* The mutant owns its own floor, so the REAL module's floor must be cleared
     too — otherwise a mutant arm leaves the shipped gate holding a high floor
     and the NEXT arm's F1 fails for a reason that has nothing to do with it. */
  if (gate !== A) A.resetFrameGate();
  return problems;
}

// ── DRIVER ──────────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const one = (argv.find((a) => a.startsWith('--mutate=')) || '').split('=')[1] || null;

  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) {
      console.log('  ' + id.padEnd(26) + ' kills ' + m.kills.join(',') + ' — ' + m.why);
    }
    process.exit(0);
  }

  if (argv.includes('--selftest')) {
    /* A FLOOR FIRST (guard-hygiene R3). A mutation harness that never runs a
       CLEAN arm scores its own corpse as "the guard went red". The clean arm
       must be GREEN before any mutation is allowed to count. */
    const clean = await envelopeFrameGateGuard(null);
    if (clean.length) {
      console.error('  ✗ SELFTEST FLOOR: the CLEAN run is already red, so no mutation below '
        + 'can be scored. Fix these first:');
      for (const m of clean) console.error('      ' + m);
      process.exit(1);
    }
    console.log('  floor: the clean run is green — mutations can be scored.');
    let bad = 0;
    for (const [id, m] of Object.entries(MUTATIONS)) {
      const found = await envelopeFrameGateGuard(id);
      const caught = m.kills.filter((k) => found.some((f) => f.startsWith(k + ':')));
      if (caught.length !== m.kills.length) {
        bad++;
        console.error('  ✗ ' + id + ' was NOT caught by ' + m.kills.filter((k) => !caught.includes(k)).join(',')
          + ' (findings: ' + (found.join(' | ') || 'none') + ')');
      } else {
        console.log('  ✓ ' + id + ' caught by ' + caught.join(','));
      }
    }
    if (bad) { console.error('envelope-frame-gate --selftest: ' + bad + ' mutation(s) uncaught'); process.exit(1); }
    console.log('envelope-frame-gate --selftest: all ' + Object.keys(MUTATIONS).length
      + ' mutations caught, on top of a green clean run.');
    process.exit(0);
  }

  const found = await envelopeFrameGateGuard(one);
  if (found.length) { for (const m of found) console.error('  ✗ ' + m); process.exit(1); }
  console.log('envelope-frame-gate: OK — one monotonic frame gate, strictly greater, '
    + 'whole-frame-or-nothing, committed by all three appliers.');
}
