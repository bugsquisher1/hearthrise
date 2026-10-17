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
// THE RULE, stated as a contract: EVERY accrued:true accrue response carries
// an `away` receipt. This guard proves it on the SERVER source: the
// standalone-settle return in index.ts constructs one (RED against the pre-fix
// source), and the main receipt forwards the engine's stop fields.
// (The client half — the deleted src/net/accrue.js gate — retired with the old
// client on 2026-10-17.)
// ============================================================================
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

export async function accrueEnvelopeAwayGuard() {
  const problems = [];
  const fail = (m) => problems.push('accrue-envelope-away: ' + m);

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
      /* `respond(...)` since lane C2 (hunt sessions): the same json() return,
         with a hunter's session view attached — the payload literal is unchanged. */
      const ret = branch.match(/return (?:json|await respond)\(\{\s*ok:\s*true,\s*accrued:\s*true[\s\S]*?\}\);/);
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

  /* == PART 1b - THE MAIN AWAY RECEIPT STATES THE STOP AND THE RECOVERY =====
     (2026-09-07, QA's P1; combat's four left with lane C2.) The engine has stated these for builds -
     `src/core/artisan-sim.js` returns burnt/stoppedBy/stoppedById/stoppedSkill/
     stoppedPerHour, `src/core/skill-sim.js` the four non-rate ones,
     `src/core/combat-sim.js` deaths/recoverMs/recoverRemainingMs/recoverLadder -
     and `out.summary` spreads the span summary whole. They were dropped HERE,
     at the response boundary, so a supply-exhausted night (8 Raw Shrimp, 8h
     away, 31 seconds of pay) carded as eight hours of honest pay, and a night
     that ended four falls in carded as "0 deaths".

     THE RULE: every one of them is FORWARDED FROM `out.summary`, never derived.
     A server that computed the stop from `paidMs < awayMs` would report a
     shortage on every ordinary night, because flooring a tick count guarantees
     that inequality. So the assertion is both "the key is on the payload" and
     "its value reads out.summary".

     MUTATION PROOF: delete any one of the nine lines from index.ts's `away: {`
     block, or replace its right-hand side with a literal, and this goes red. */
  try {
    const idx = await readFile(new URL('supabase/functions/hr-accrue/index.ts', ROOT), 'utf8');
    const start = idx.indexOf('      away: {');
    const end = idx.indexOf('        events: out.events,', start);
    if (start < 0 || end < 0) {
      fail('RECEIPT: could not locate the main `away: {` payload in index.ts - the guard is stale, '
        + 'fix it before trusting green');
    } else {
      const block = idx.slice(start, end);
      /* LANE C2: the four combat fields (deaths / recoverMs /
         recoverRemainingMs / recoverLadder) left this payload with the away
         combat path — a fight is a hunt session, settled by hunt_settle and the
         world tick, and its falls ride the session tally (hunt.falls / down_ms),
         never the accrue receipt. The accrue path prices gathering and benches,
         and these five are the stops those engines state. */
      const RECEIPT_FIELDS = [
        'burnt', 'stoppedBy', 'stoppedById', 'stoppedSkill', 'stoppedPerHour',
      ];
      for (const key of RECEIPT_FIELDS) {
        const m = block.match(new RegExp('^\\s*' + key + ':([\\s\\S]*?)(?=\\n\\s*(?:/\\*|[a-zA-Z]+:))', 'm'));
        if (!m) {
          fail('RECEIPT: the away payload does not send `' + key + '`, which summaryFromAway reads '
            + 'and a welcome-back renderer prints. The engine states it on out.summary; dropping it '
            + 'here is the b345 class - a stopped night reads as a full one.');
        } else if (!/out\.summary\./.test(m[1])) {
          fail('RECEIPT: `' + key + '` is not forwarded from out.summary - the receipt must state '
            + 'what the simulation did, never re-derive it (a stop derived from paidMs < awayMs is '
            + 'true on every ordinary night).');
        }
      }
    }
  } catch (e) {
    fail('RECEIPT: could not read index.ts: ' + (e && e.message));
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
