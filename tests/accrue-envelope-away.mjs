// ============================================================================
// tests/accrue-envelope-away.mjs — THE ENVELOPE CONTRACT GUARD (b475)
//
// THE BUG THIS WOULD HAVE CAUGHT: index.ts's standalone parallel-settle branch
// (the `if (!out.accrued)` block — the pointer is idle but the RESTED bank
// owes something; the WORKER crew rode it too until its 2026-11-18 cut) returned `accrued:true` WITHOUT an
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

  // ── PART 1 — SOURCE: the not-accrued branch writes nothing of its own. ─────
  // The b475 class lived in a STANDALONE parallel settle inside index.ts's
  // `if (!out.accrued)` block (the crew's until 2026-11-18, the rested bank's
  // until 2026-11-21, S-9 c): an hr_apply of its own that returned accrued:true
  // without an `away` receipt. The last one left with the rested bank. The
  // branch now settles nothing itself: a hunter's accrue goes to the one hunt
  // settle (respond -> settleHunt), every other idle pointer answers
  // accrued:false and writes nothing. So the rule reads: no hr_apply call in
  // the branch, no fresh roll, and any literal accrued:true it returns carries
  // an `away` receipt. A side bank that comes back must bring its receipt.
  try {
    const idx = await readFile(new URL('supabase/functions/hr-accrue/index.ts', ROOT), 'utf8');
    const start = idx.indexOf('    if (!out.accrued) {');
    const end = start < 0 ? -1 : idx.indexOf('// ── APPLY.', start);
    if (start < 0 || end < 0) {
      fail('SOURCE: could not locate the not-accrued branch in index.ts (`if (!out.accrued) {` up to '
        + 'the `// ── APPLY.` banner) — the guard is stale, fix it before trusting green');
    } else {
      const branch = idx.slice(start, end);
      const code = branch.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      if (/hr_apply\s*\(/.test(code)) {
        fail('SOURCE: the not-accrued branch calls hr_apply again — a standalone parallel settle is back. '
          + 'It must return its grant with an `away` receipt (summaryFromAway reads it) or the b475 '
          + '"Away progress is paused" modal fires while the grant is hidden.');
      }
      for (const ret of code.match(/return (?:json|await respond)\(\{\s*ok:\s*true,\s*accrued:\s*true[\s\S]*?\}\);/g) || []) {
        if (!/\baway\b/.test(ret)) {
          fail('SOURCE: the not-accrued branch returns accrued:true WITHOUT an `away` receipt — '
            + 'isEnvelopeApplicable rejects it as malformed. This is the b475 class.');
        }
      }
      // Any receipt there must be a pure projection — never a fresh roll.
      if (/Math\.random\s*\(/.test(code)) {
        fail('SOURCE: the not-accrued branch uses Math.random — a receipt must be a pure projection '
          + 'of what was already granted (determinism / AWAY-1).');
      }
    }
  } catch (e) {
    fail('SOURCE: could not read index.ts: ' + (e && e.message));
  }

  /* == PART 1b - THE MAIN AWAY RECEIPT STATES THE STOP AND THE RECOVERY =====
     (2026-09-07, QA's P1; combat's four left with lane C2.) The engine has stated these for builds -
     `src/core/artisan-sim.js` returns stoppedBy/stoppedById/stoppedSkill/
     stoppedPerHour (the Hearth's fuel run, since the one-town-work cut),
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

     MUTATION PROOF: delete any one of the four lines from index.ts's `away: {`
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
         never the accrue receipt. The accrue path prices the Hearth's fuel run (the
         bench and gathering left with the one-town-work cut, and the bench's `burnt`
         with them), and these four are the stops that engine states. */
      const RECEIPT_FIELDS = [
        'stoppedBy', 'stoppedById', 'stoppedSkill', 'stoppedPerHour',
      ];
      for (const key of RECEIPT_FIELDS) {
        const m = block.match(new RegExp('^\\s*' + key + ':([\\s\\S]*?)(?=\\n\\s*(?:/\\*|[a-zA-Z]+:))', 'm'));
        if (!m) {
          fail('RECEIPT: the away payload does not send `' + key + '`, which a welcome-back '
            + 'renderer prints. The engine states it on out.summary; dropping it '
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
import { isMain } from './_is-main.mjs';
if (isMain(import.meta.url)) {
  accrueEnvelopeAwayGuard().then((p) => {
    if (p.length) { for (const m of p) console.error('  ✗ ' + m); process.exit(1); }
    console.log('accrue-envelope-away: OK — every accrued:true response carries a well-formed away receipt.');
  });
}
