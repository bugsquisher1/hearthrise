// ============================================================================
// tests/activity-seam.mjs — THE LINK BETWEEN THE TWO HALVES OF ONE CONTRACT.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// b347 wired the client half of the activity intent: four call sites in
// src/legacy.js, all combat, matching the server's `SETTABLE_KINDS` of
// `['idle','combat']` exactly. Correct, complete, and shipped.
//
// The very next merge taught the accrual engine to pay gathering.
// `PAYABLE_KINDS` gained `'gather'`; `SETTABLE_KINDS` is DERIVED from it, so it
// grew in the same edit, exactly as its author intended. The server half was
// finished. Nobody added a client call site, because nothing said one was
// missing — the two lists live in different files, in different runtimes, under
// different review, and neither could see the other.
//
// Tyler ran the first switch-on test. He started woodcutting, left for a few
// minutes, and came back to a stopped run. The server's own records:
//
//     player_state  slot 0 → active_kind 'idle', gold 500, version 0
//     player_intents        → 0 rows
//     rate counters         → 7 accrue, 7 load
//
// Seven accruals against a pointer that had never been set. Nothing was broken;
// the client simply never said the words.
//
// ⚠ THE LESSON IS NOT "REMEMBER THE CLIENT NEXT TIME." It is that a contract
//   split across two files with no mechanical link between them WILL be
//   half-shipped, and that the only fix which survives a busy week is a build
//   failure. This file is that failure.
//
// ── WHAT IT ASSERTS, AND WHY EACH HALF IS NEEDED ────────────────────────────
//   S1  the server's SETTABLE_KINDS and the client's ACTIVITY_KINDS are the
//       SAME SET. Widening one without the other fails the build, by name.
//   S2  every settable kind has a real declaration CALL SITE in src/legacy.js.
//       S1 alone would pass a client that can declare `gather` and never does —
//       which is a different way to ship exactly the same outage.
//   S3  the client's gather index and the accrual engine's GATHER_NODES have
//       identical keys. A node the client can start and the server cannot price
//       is an activity that accrues nothing, silently.
//   S4  a game activity that is NOT settable is downgraded to `idle`, never
//       dropped. Silence leaves the server paying for the previous activity.
//   S5  `activity_unsupported` is treated as ANSWERED — no retry loop.
//
// S2 is a source scan, which this repo is rightly suspicious of. It is here
// because it is the cheapest thing that fails on the exact mutation that caused
// b348 (delete the declaration from `startSkill`), and it is NOT the only
// guard: `src/features/smoke-test.js` B348-2/3/4 drives the real player gesture
// in a real browser and asserts the bytes that leave it. Source scan catches
// "nobody wrote it"; the browser test catches "it is written and unreachable".
//
// Node-only. Imported by tests/run-smoke.mjs, so it gates every push.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
/* readFile takes a PATH; import() takes a URL. On Windows the two are not
   interchangeable — a `fileURLToPath` result starts `R:\` and the ESM loader
   refuses it as "protocol 'r:'". Two accessors, named for what they feed. */
const at = (p) => fileURLToPath(new URL(p, ROOT));
const mod = (p) => new URL(p, ROOT).href;

const problems = [];
const fail = (m) => problems.push(m);

/** Set equality, reported as the DIFFERENCE — "not equal" is not a diagnosis. */
function diff(a, b) {
  const A = new Set(a); const B = new Set(b);
  return {
    onlyA: [...A].filter((x) => !B.has(x)),
    onlyB: [...B].filter((x) => !A.has(x)),
  };
}

export async function runAll() {
  problems.length = 0;

  let server; let client; let catalogue; let skillSim; let gathering;
  try {
    [server, client, catalogue, skillSim, gathering] = await Promise.all([
      import(mod('supabase/functions/hr-accrue/set-activity.js')),
      import(mod('src/net/activity.js')),
      import(mod('supabase/functions/hr-accrue/catalogue.js')),
      import(mod('src/core/skill-sim.js')),
      import(mod('src/data/gathering.js')),
    ]);
  } catch (e) {
    fail('the activity seam could not be loaded, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }

  const settable = server.SETTABLE_KINDS;
  const declarable = client.ACTIVITY_KINDS;

  /* ── S1 ─────────────────────────────────────────────────────────────────
     The two lists are one contract. Reported as a difference in BOTH
     directions, because the two failures need opposite fixes: a kind the
     server can set and the client cannot declare is b348 (an activity the
     server will never be told about); a kind the client declares and the
     server cannot set is a guaranteed 409 on a real player gesture. */
  const d1 = diff(settable, declarable);
  for (const k of d1.onlyA) {
    fail(`ACTIVITY SEAM: the server can SET '${k}' (SETTABLE_KINDS in `
      + `supabase/functions/hr-accrue/set-activity.js) and the client cannot DECLARE it `
      + `(ACTIVITY_KINDS in src/net/activity.js). This is the b348 outage exactly: the engine will pay `
      + `'${k}' and no client gesture can ever tell it the player is doing it, so player_state sits at `
      + `idle and every away grant is zero. Add '${k}' to ACTIVITY_KINDS and wire a declaration site.`);
  }
  for (const k of d1.onlyB) {
    fail(`ACTIVITY SEAM: the client declares '${k}' and the server's SETTABLE_KINDS does not accept it — `
      + `every real player gesture for '${k}' spends an intent key and a rate budget to earn a 409 `
      + `activity_unsupported. Either widen PAYABLE_KINDS (with a simulation) or route '${k}' through `
      + `declarationFor's downgrade instead of declaring it.`);
  }

  /* ── S2: THE CALL SITES ─────────────────────────────────────────────────
     A declarable kind nobody declares is the same outage wearing a different
     hat. Scanned rather than executed here; B348-3 in the browser suite drives
     the gesture. `idle` is exempt from needing its own gesture only in the
     sense that it is a STOP — it is still required to appear, because a seam
     that can start and never stop pays for abandoned activities forever. */
  let legacy = '';
  try { legacy = await readFile(at('src/legacy.js'), 'utf8'); }
  catch (e) { fail('src/legacy.js could not be read: ' + (e && e.message)); return problems; }

  for (const kind of settable) {
    /* Deliberately narrow: a LITERAL kind at a real call site. A computed kind
       would slip past this, which is why B348-3 exists — but a literal is what
       every site in this file actually uses, and matching it means the mutation
       "delete the declaration" is caught rather than argued about. */
    const re = new RegExp(`declareActivity\\(\\s*['"]${kind}['"]`);
    if (!re.test(legacy)) {
      fail(`ACTIVITY SEAM: no site in src/legacy.js declares '${kind}'. The client is ALLOWED to declare `
        + `it (ACTIVITY_KINDS) and the server is waiting to be told (SETTABLE_KINDS), and no player gesture `
        + `ever says it. That is b348: woodcutting ran for minutes while player_intents held 0 rows.`);
    }
  }
  /* The DOWNGRADE has a call site too, or `artisan` is silent again — and
     silence is the mis-payment, not the neutral option. */
  if (!/declareActivity\(\s*['"]artisan['"]/.test(legacy)) {
    fail('ACTIVITY SEAM: nothing in src/legacy.js declares `artisan`. It is not settable today and it is '
      + 'not supposed to be silent either: an artisan run that says nothing leaves the server\'s pointer on '
      + 'the PREVIOUS activity, so a player who chops oak and then cooks is paid for oak for as long as '
      + 'they cook. `declarationFor` turns it into an honest `idle`; the call site has to exist for it to.');
  }

  /* ── S3: ONE CATALOGUE, TWO READERS ─────────────────────────────────────
     The client resolves a node id to a skill through `indexGatherNodes` over
     TREES/ROCKS/FISH_SPOTS (src/core-bridge.js), which is the same function
     over the same three arrays that supabase/functions/hr-accrue/catalogue.js
     uses. This asserts the RESULT, so a mapping that drifts on either side —
     a new tree array, a renamed rock — fails here rather than in a player's
     night. */
  const clientIdx = skillSim.indexGatherNodes({
    woodcutting: gathering.TREES, mining: gathering.ROCKS, fishing: gathering.FISH_SPOTS,
  });
  const d3 = diff(Object.keys(clientIdx), Object.keys(catalogue.GATHER_NODES));
  if (d3.onlyA.length || d3.onlyB.length) {
    fail('ACTIVITY SEAM: the client gather index and the accrual engine\'s GATHER_NODES disagree — '
      + `client-only [${d3.onlyA.join(', ')}], engine-only [${d3.onlyB.join(', ')}]. A node the client can `
      + 'start and the engine cannot price accrues NOTHING for the whole absence, and the refusal is a '
      + '409 the player never sees.');
  }
  for (const id of Object.keys(clientIdx)) {
    const a = clientIdx[id]; const b = catalogue.GATHER_NODES[id];
    if (b && a.skill !== b.skill) {
      fail(`ACTIVITY SEAM: '${id}' is ${a.skill} on the client and ${b.skill} in the accrual engine — the `
        + 'two would credit different skills for the same swing.');
    }
  }
  if (!Object.keys(clientIdx).length) {
    fail('ACTIVITY SEAM: the gather index is EMPTY, so S3 compared nothing and would pass whatever broke.');
  }

  /* ── S4: NOT SETTABLE ≠ NOT DECLARED ────────────────────────────────────
     Every kind the GAME can do must produce a declaration. The ones the engine
     cannot price produce `idle` — which is a real statement ("stop the meter"),
     not an omission. */
  for (const kind of client.GAME_ACTIVITY_KINDS) {
    const d = client.declarationFor(kind, kind === 'idle' ? null : 'some_id');
    if (!d) {
      fail(`ACTIVITY SEAM: declarationFor('${kind}') produced nothing. A game activity with no declaration `
        + 'leaves the server\'s pointer on the previous one, and the server then pays for something the '
        + 'player stopped doing.');
      continue;
    }
    const expected = declarable.indexOf(kind) === -1 ? 'idle' : kind;
    if (d.kind !== expected) {
      fail(`ACTIVITY SEAM: declarationFor('${kind}') declares '${d.kind}', expected '${expected}'.`);
    }
  }
  if (client.declarationFor('not_a_kind', 'x') !== null) {
    fail('ACTIVITY SEAM: a kind the game cannot do was accepted and downgraded to a stop — that hides a '
      + 'client bug behind a legitimate-looking declaration.');
  }
  /* The wire builder is the last gate: it may only ever emit a declarable kind. */
  const wire = JSON.parse(client.buildActivityRequest({ kind: 'artisan', id: 'cook_shrimp', intentId: 'k' }).init.body);
  if (wire.activity.kind !== 'idle' || wire.activity.id !== null) {
    fail(`ACTIVITY SEAM: buildActivityRequest emitted ${JSON.stringify(wire.activity)} for a non-declarable `
      + 'kind — the request body must only ever carry a kind from ACTIVITY_KINDS.');
  }
  for (const kind of declarable) {
    const w = JSON.parse(client.buildActivityRequest({ kind, id: 'oak_tree', intentId: 'k' }).init.body);
    if (w.activity.kind !== kind) {
      fail(`ACTIVITY SEAM: buildActivityRequest rewrote a DECLARABLE '${kind}' as '${w.activity.kind}'. `
        + 'It used to read `o.kind === \'combat\' ? \'combat\' : \'idle\'`, which silently turns every new '
        + 'kind into a STOP — worse than not sending it, because the server acts on it.');
    }
  }

  /* ── S5: A NAMED REFUSAL IS AN ANSWER ───────────────────────────────────
     `activity_unsupported` is refused on SHAPE, before any database work, so
     the client knows the outcome exactly. Retrying it would spin against a
     verdict that cannot change, and a rejected key stays rejected for 25 hours
     anyway. */
  const unsupported = { outcome: 'refused', reason: 'activity_unsupported' };
  if (client.shouldRetryActivity(unsupported, 1, 2) !== false) {
    fail('ACTIVITY SEAM: `activity_unsupported` is being retried. It is an ANSWER — refused on shape before '
      + 'any database work — and the verdict cannot change without a deploy; a retry loop here burns the '
      + '30/min budget for nothing.');
  }
  if (client.isAnswered('refused') !== true) {
    fail('ACTIVITY SEAM: a refusal is not classified as ANSWERED, so its key would be reused — and hr_apply '
      + 'hands the stored refusal back to every later call presenting it, for up to 25 hours.');
  }
  /* CONTROL: the two outcomes that MUST retry still do, or the check above
     passes because retrying was switched off wholesale. */
  if (client.shouldRetryActivity({ outcome: 'unreachable' }, 1, 2) !== true
      || client.shouldRetryActivity({ outcome: 'refused', reason: 'version_conflict' }, 1, 2) !== true) {
    fail('ACTIVITY SEAM: retry has been disabled wholesale — S5 would then pass for the wrong reason.');
  }

  return problems;
}

export function summary(settable, declarable) {
  return `${settable.length} settable kinds, ${declarable.length} declarable`;
}
