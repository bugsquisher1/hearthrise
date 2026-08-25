// ============================================================================
// tests/accrue-envelope-away.mjs — THE ENVELOPE CONTRACT GUARD (b475)
//
// THE BUG THIS WOULD HAVE CAUGHT: index.ts's standalone parallel-settle branch
// (the `if (!out.accrued)` block — the pointer is idle but the RESTED bank
// and/or the WORKER crew owe something) returned `accrued:true` WITHOUT an
// `away` receipt. The client gate `isEnvelopeApplicable` (src/net/accrue.js)
// REQUIRES `res.away` to be an object; without it `classifyAccrueResponse`
// returns `malformed`, three of those trip ACCRUE_HALT_AFTER_TRIES → the
// "Away progress is paused" modal + a HIDDEN grant the server already made.
// Every OTHER accrued:true path (the main away path, cooking-away) attaches
// `away`, so this ONE branch was the whole class.
//
// THE RULE, stated as a contract: EVERY accrued:true accrue response MUST
// satisfy isEnvelopeApplicable. This guard proves it two ways:
//   1. SOURCE — the standalone-settle return in index.ts constructs an `away`
//      receipt. RED against the pre-fix source.
//   2. CONTRACT — the rested-only and worker-only responses the branch returns
//      pass isEnvelopeApplicable + classify as `accrued`; the SAME responses
//      with `away` stripped classify as `malformed` (proving the gate is what
//      rejects, and the fix is what satisfies it); and the idle-nothing-owed
//      `accrued:false` case classifies as `nothing`.
// ============================================================================
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

export async function accrueEnvelopeAwayGuard() {
  const problems = [];
  const fail = (m) => problems.push('accrue-envelope-away: ' + m);

  // ── Load the REAL client gate. Derive accrue.js's own ?v= so we load the
  //    module the browser loads, not a partition of it. ──────────────────────
  let A;
  try {
    const src = await readFile(new URL('src/net/accrue.js', ROOT), 'utf8');
    const m = src.match(/item-authority\.js\?v=(\d+)/);
    const v = m ? `?v=${m[1]}` : '';
    A = await import(mod('src/net/accrue.js' + v));
  } catch (e) {
    fail('could not load accrue.js, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }
  const { isEnvelopeApplicable, classifyAccrueResponse, reconcileWorkers } = A;
  if (typeof isEnvelopeApplicable !== 'function' || typeof classifyAccrueResponse !== 'function') {
    fail('accrue.js does not export isEnvelopeApplicable / classifyAccrueResponse');
    return problems;
  }

  // ── PART 1 — SOURCE: the standalone-settle return attaches `away`. ─────────
  // This is the check that would have caught the class at build time. The
  // branch is the `if (wr && wr.ok === true && wr.replayed !== true)` block; it
  // must build an `away` receipt before returning accrued:true.
  try {
    const idx = await readFile(new URL('supabase/functions/hr-accrue/index.ts', ROOT), 'utf8');
    const start = idx.indexOf('const wr = wres?.res as Record<string, any>;');
    if (start < 0) {
      fail('SOURCE: could not locate the standalone parallel-settle branch in index.ts '
        + '(the `const wr = wres?.res` line) — the guard is stale, fix it before trusting green');
    } else {
      // The branch ends at the fall-through comment after the if.
      const end = idx.indexOf('A refused / replayed aux settle', start);
      const branch = idx.slice(start, end < 0 ? start + 2500 : end);
      // The accrued:true return in this branch must carry an away receipt.
      const ret = branch.match(/return json\(\{\s*ok:\s*true,\s*accrued:\s*true[\s\S]*?\}\);/);
      if (!ret) {
        fail('SOURCE: could not find the accrued:true return inside the standalone-settle branch');
      } else if (!/\baway\b/.test(ret[0])) {
        fail('SOURCE: the standalone parallel-settle branch returns accrued:true WITHOUT an `away` '
          + 'receipt — isEnvelopeApplicable will reject it as malformed and the "Away progress is '
          + 'paused" modal fires while the grant is hidden. This is the b475 class.');
      }
      // And it must build the receipt as a pure projection — never a fresh roll.
      if (/Math\.random\s*\(/.test(branch)) {
        fail('SOURCE: the standalone-settle branch uses Math.random — the away receipt must be a '
          + 'pure projection of what was already granted (determinism / AWAY-1).');
      }
      // windowTo must be the numeric now (nowMs), NOT the ISO `read.now` — the
      // client's summaryFromAway reads it as Number(a.windowTo) and an ISO
      // string coerces to NaN, carding a null window. The main away path uses
      // credit.toMs (ms). This is the exact field-type defect flagged in review.
      if (/windowTo:\s*read\.now\b/.test(branch)) {
        fail('SOURCE: the standalone-settle away receipt sets `windowTo: read.now` (an ISO string) — '
          + 'summaryFromAway does Number(a.windowTo) so the card shows a null window. Use nowMs (ms).');
      }
      /* THE ROSTER-CLOBBER GUARD (2026-08-25). The branch must NOT put the worker
         SUMMARY back at the `workers` key — that overwrites hr_state_of's crew
         roster (from `...wr`) with a stats object, and reconcileWorkers then sees
         a non-array and leaves the crew empty. The summary rides `workerSummary`. */
      if (/\bworkers:\s*wout\.summary\b/.test(branch)) {
        fail('SOURCE: the standalone-settle branch spreads `workers: wout.summary`, clobbering the '
          + 'crew ROSTER `...wr` carries. reconcileWorkers reads `workers` as an array and will skip '
          + 'the summary object, leaving an idle player\'s producing crew invisible. Use workerSummary.');
      }
    }
  } catch (e) {
    fail('SOURCE: could not read index.ts: ' + (e && e.message));
  }

  // ── PART 2 — CONTRACT: the responses the branch returns pass the gate. ─────
  // A minimal well-formed post-apply envelope (state/skills/inventory/version),
  // the shape hr_apply spreads via `...wr`.
  const baseEnvelope = () => ({
    ok: true,
    accrued: true,
    version: 1234,
    now: '2026-08-25T00:00:00.000Z',
    state: { gold: 0, accrued_to: null },
    skills: { attack: { xp: 0 } },
    inventory: {},
  });

  // The away receipt the fix attaches — a pure projection, no rolls.
  const awayReceipt = (items) => ({
    grantMs: 172800000, capped: false,
    awayMs: 172800000, paidMs: 172800000, unpaidMs: 0,
    // MS NUMBERS — the contract the main away path (credit.fromMs/toMs) and
    // summaryFromAway (Number(a.windowFrom)) share. ISO here would card as null.
    windowFrom: 1755907200000, windowTo: 1756080000000,
    tickMs: 0, perkChannel: 'n/a',
    kills: 0, crits: 0, died: false, foodEaten: 0,
    blessed: false, buffsPaused: false, featuredMs: 0, featuredDropMult: 1,
    gold: 0, xp: {}, items: items || {}, levelUps: [], events: [],
  });

  // Rested-only standalone settle: nothing from the pointer, a rested bank
  // charged. `away` carries no items; the bank is surfaced via `rested`.
  const restedOnly = { ...baseEnvelope(), away: awayReceipt({}), rested: { granted: 3 } };

  /* Worker-only standalone settle: crew haul on `away.items`; `workers` is the
     CREW ROSTER (the array reconcileWorkers reads), and the stats summary rides
     the non-colliding `workerSummary` key. The pre-2026-08-25 shape put the
     summary at `workers`, which clobbered the roster and left an idle player's
     producing crew invisible. */
  const WORKER_ROSTER = [
    { uid: 'wSRV', name: 'Aldric', skill: 'mining', target_id: 'copper_rock', xp: 74598, acc_ms: 0 },
  ];
  const workerOnly = {
    ...baseEnvelope(),
    away: awayReceipt({ copper_ore: 40 }),
    workers: WORKER_ROSTER,
    workerSummary: { spanMs: 172800000, qty: 40, workers: 1, capped: false },
  };

  // Both compose.
  const both = {
    ...baseEnvelope(),
    away: awayReceipt({ copper_ore: 40 }),
    workers: WORKER_ROSTER,
    workerSummary: { spanMs: 172800000, qty: 40, workers: 1, capped: false },
    rested: { granted: 3 },
  };

  for (const [label, res] of [['rested-only', restedOnly], ['worker-only', workerOnly], ['both', both]]) {
    if (!isEnvelopeApplicable(res)) {
      fail(`CONTRACT: the ${label} standalone-settle response FAILS isEnvelopeApplicable — `
        + 'the client would treat a genuine grant as malformed and pause away progress.');
    }
    const c = classifyAccrueResponse(200, res);
    if (c.outcome !== 'accrued') {
      fail(`CONTRACT: the ${label} standalone-settle response classifies as "${c.outcome}" `
        + `(reason: ${c.reason || 'none'}) — expected "accrued".`);
    }
  }

  // The GATE proof: the SAME responses with `away` stripped MUST be rejected —
  // this is the exact pre-fix shape, and it must read malformed (never accrued).
  for (const [label, res] of [['rested-only', restedOnly], ['worker-only', workerOnly]]) {
    const { away, ...noAway } = res;
    if (isEnvelopeApplicable(noAway)) {
      fail(`GATE: the ${label} response WITHOUT away passed isEnvelopeApplicable — the client `
        + 'gate has been weakened; it must fail closed on a missing away receipt.');
    }
    const c = classifyAccrueResponse(200, noAway);
    if (c.outcome !== 'malformed') {
      fail(`GATE: the ${label} response WITHOUT away classified as "${c.outcome}" — expected `
        + '"malformed" (this is the b475 pre-fix shape).');
    }
  }

  // The idle-nothing-owed case is still a clean accrued:false the client handles.
  {
    const idle = { ok: true, accrued: false, reason: 'idle', version: 1234, now: '2026-08-25T00:00:00.000Z' };
    const c = classifyAccrueResponse(200, idle);
    if (c.outcome !== 'nothing') {
      fail(`CONTRACT: the idle-nothing-owed accrued:false response classified as "${c.outcome}" — `
        + 'expected "nothing".');
    }
  }

  /* RECONCILE CONTRACT (2026-08-25). The worker-only standalone-settle envelope
     must actually RENDER the crew: reconcileWorkers reads `res.workers` as the
     roster and returns the crew size. A summary object at `workers` (the pre-fix
     shape) returns null — the invisible-crew bug. This is the client half of the
     roster-clobber guard above. */
  if (typeof reconcileWorkers === 'function') {
    const G = { workers: { hired: [] } };
    const n = reconcileWorkers(G, workerOnly);
    if (n !== 1 || !(G.workers && G.workers.hired && G.workers.hired.length === 1)) {
      fail('RECONCILE: the worker-only standalone-settle envelope did not render the crew '
        + `(reconcileWorkers -> ${n}); the roster must live at res.workers as an array.`);
    } else if (G.workers.hired[0].uid !== 'wSRV' || G.workers.hired[0].targetId !== 'copper_rock') {
      fail('RECONCILE: the crew rendered but lost its identity/assignment (target_id -> targetId).');
    }
    // The pre-fix shape (summary at `workers`) must NOT reconcile — proving the fix is load-bearing.
    const G2 = { workers: { hired: [] } };
    const preFix = { ...workerOnly, workers: { spanMs: 1, qty: 40, workers: 1, capped: false } };
    if (reconcileWorkers(G2, preFix) !== null) {
      fail('RECONCILE: a summary object at `workers` was treated as a roster — the guard is not '
        + 'catching the clobber shape.');
    }
  } else {
    fail('accrue.js does not export reconcileWorkers');
  }

  return problems;
}

// Allow standalone execution: `node tests/accrue-envelope-away.mjs`
import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  accrueEnvelopeAwayGuard().then((p) => {
    if (p.length) { for (const m of p) console.error('  ✗ ' + m); process.exit(1); }
    console.log('accrue-envelope-away: OK — every accrued:true response carries a well-formed away receipt.');
  });
}
