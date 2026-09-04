#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// tests/property-gate-census.mjs — NO RESIDUE FIELD MAY GATE A SERVER-OWNED
// CAPABILITY, AND THE PROPERTY RUNG IS THE SERVER'S IN BOTH DIRECTIONS.
//
// ── THE CLASS THIS FILE EXISTS FOR ──────────────────────────────────────────
// Twice now the property tier has produced a live P1, from opposite directions,
// because ONE integer — `G.homestead.tier`, a RESIDUE field
// (src/net/client-state.js RESIDUE_FIELDS: a self-only cache the server stores
// verbatim and derives NO authority from) — gated a set of SERVER-OWNED
// capabilities: which rooms may be built, how many farm plots may be bought, how
// many workers may be hired, which property rung is OFFERED next.
//
//   b492 (paione, 2026-08-29)  residue BEHIND the server. A lost residue save
//     demoted a paid Homestead to the Wanderer's Camp: worker cap 0 beside a
//     hired worker, 2 plots instead of 4. Fixed by reading the rung off the
//     `progress` projection — as a RAISE-ONLY FLOOR, max(server, residue).
//
//   b502 (paione, 2026-09-04)  residue AHEAD of the server, which max() then
//     preserved FOREVER. Server: unlock property:homestead = 1, no farmstead row.
//     Residue: {"tier":2}. hr_rejections 16:23–16:32 UTC: unlock_buy
//     `room.forge.1` refused prereq_property_tier {have:1,need:2} ×10 (also
//     09-01, 08-31; worker_hire.2 since 08-27; a second player on
//     room.workshop.1 ×11 on 08-26). The House named a property he did not own,
//     the Forge card looked buildable, and "Upgrade Property" offered the rung
//     ABOVE the one he was missing — so the account could not build, could not
//     hire, and could not even BUY its way out. Nothing in the client could
//     climb back down.
//
// The bug was never the number. It was the SHAPE: a client-authored cache
// allowed to out-rank a server-owned entitlement. This guard makes that shape
// fail the build.
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────────────────
//   L1  BEHAVIOUR (executed, not grepped). src/net/property-record.js is pure
//       and Node-importable, so the merge rule is driven directly: paione's row
//       resolves DOWN to 1; the b492 upward heal still works; UNKNOWN moves
//       nothing; a `progress_truncated` answer may only RAISE; a confirmed grant
//       and a prereq_property_tier refusal are both statements.
//   L2  THE READ CENSUS, derived from source. Every `.homestead` residue read
//       under src/ must live in one of the two files that OWN the rung. A third
//       file reading it is a second source of truth — exactly how this class
//       recurs — and fails until it is routed through the accessor or
//       explicitly classified here with a reason.
//   L3  THE CONSUMER CENSUS, derived from source. Every file that reaches the
//       homestead API through `window.HearthriseHomestead` must be classified
//       DISPLAY-ONLY or CAPABILITY, with a reason. A new consumer fails the
//       build until someone states which it is — the classification is the
//       point, not the list.
//   L4  THE RATCHET IS DEAD. No `homestead.tier = Math.max(…)` anywhere under
//       src/: that max() is precisely what made the forged residue permanent.
//   L5  THE WIRING. getTier() routes through healPropertyTier; the confirmed
//       upgrade tells the record (notePropertyGranted); the verdict reader
//       ingests a prereq_property_tier refusal (notePropertyRefusalTier).
//   L6  THE CONTROL (mutation proof). The scanners are re-run against injected
//       sources that re-introduce each defect; if any of them still passes, the
//       scanner is not looking at anything and L2–L5 passed for free.
//
// Run standalone:  node tests/property-gate-census.mjs
// Wired into the suite as propertyGateCensusGuard().
// ════════════════════════════════════════════════════════════════════════════
import { readFile, readdir } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);

/* ── THE TWO FILES THAT OWN THE RUNG ─────────────────────────────────────────
   A `.homestead` read anywhere else is a SECOND SOURCE of the tier, which is
   the shape both P1s took. Adding a file here is a deliberate claim that it is
   part of the rung's own machinery — not "it was convenient". */
const RESIDUE_READ_OWNERS = new Map([
  ['src/net/property-record.js',
    'THE RECORD. Reads the residue as the UNKNOWN-only fallback and WRITES the '
    + 'conformed rung back into it (healPropertyTier). This file IS the authority.'],
  ['src/features/homestead.js',
    'THE ONE ACCESSOR. ensureState() bootstraps the field; getTier() reads it only '
    + 'when the record is UNKNOWN; advanceTierTo() writes a rung the server has '
    + 'already confirmed. Every other property-gated number in the game funnels '
    + 'through getTier(), which is why this file is the only legitimate reader.'],
]);

/* ── THE CONSUMER CENSUS ─────────────────────────────────────────────────────
   Every file that reaches `window.HearthriseHomestead`, classified. DISPLAY is
   "this number is only rendered"; CAPABILITY is "this number decides whether an
   action is permitted or what it pays" — the class that MUST come from the
   record, which today it does by construction because all of them route through
   getTier(). The point of the table is that a new consumer cannot appear
   unclassified: it fails the build until someone has thought about it. */
const CONSUMERS = new Map([
  ['src/features/homestead.js', {
    kind: 'OWNER',
    why: 'defines the API. getTier() is the ONE read; canBuildRoom/roomAllowed/nextTier/'
       + 'maxPlots/workerSlots/offlineBonusHours/isCastle all derive from it.',
  }],
  ['src/legacy.js', {
    kind: 'CAPABILITY',
    why: 'roomRungGate (the gate upgradeRoom enforces with) and buildPlot\'s plot cap ask '
       + 'HH.canBuildRoom/HH.getTier/HH.maxPlots; clientPerkState publishes HH.getTier() as '
       + '`propertyTier` for the castle capstone; offline cap adds HH.offlineBonusHours(). '
       + 'All routed through getTier() — none reads the residue.',
  }],
  ['src/features/workers.js', {
    kind: 'CAPABILITY',
    why: 'slots() is the crew cap hire() pre-flights against — the "Workers 1/0" surface. '
       + 'Reads HH.workerSlots(), which is tierDef().workers floored by the PAID worker_hire '
       + 'rung (property-record effectiveWorkerSlots), never the residue.',
  }],
  ['src/features/clan-seat-ui.js', {
    kind: 'CAPABILITY',
    why: 'HH.isCastle() adds a clan-seat bonus — a payout modifier, so it is a capability '
       + 'read, not decoration. Routed through getTier().',
  }],
  ['src/features/chronicle.js', {
    kind: 'DISPLAY',
    why: 'names the current property rung in the chronicle and logs a tier CHANGE '
       + '(before/after H.getTier()). Renders only; grants nothing.',
  }],
  ['src/features/home-dashboard.js', {
    kind: 'DISPLAY',
    why: 'the launchpad property card — tier name, next rung, plots/workers figures. '
       + 'Renders only; the Upgrade action is HH.upgradeProperty().',
  }],
]);

/* ── THE STRIPPER, AND WHY IT IS NOT THE ONE arm-homing-guard USES ───────────
   A census that cannot see the file it is censusing passes for free. The
   stripper in tests/arm-homing-guard.mjs (its own header says so) does not know
   what a regex literal is — and `src/legacy.js` contains regexes carrying
   quote characters, e.g. `/['"]/`. The first one flips the scanner into STRING
   mode and it never recovers: measured on this tree, that stripper blanks
   ~15,200 of legacy.js's 21,452 lines, including line 11061 — the
   `notePropertyRefusalTier` wiring this very guard asserts, which it duly
   reported as MISSING while the call sat right there in the file.

   So this one is a real little scanner: comments, strings, TEMPLATE literals
   with `${…}` re-entry, and regex literals with character classes. It returns
   BOTH projections, char-for-char the same length as the source so every offset
   and line number stays honest:

     code      comments AND string interiors blanked  → identifier scans
     noComment comments blanked, strings INTACT       → the bracket form
                                                        `G['homestead']`, which
                                                        lives inside a string by
                                                        construction and is
                                                        invisible in `code`
     desynced  the scanner ended inside a string/comment/template, i.e. it lost
               the thread and NOTHING it reports about this file can be trusted.
               The guard fails on it rather than reporting a clean census.

   `/` is a regex when the previous significant character cannot end an
   expression (an operator, an opener, a `,` `;` `:` `?`, or nothing at all), or
   when the token before it is one of the keywords a regex may follow. */
const KEYWORD_BEFORE_REGEX = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else', 'yield', 'await',
]);

export function stripSource(raw) {
  const src = String(raw == null ? '' : raw);
  const n = src.length;
  let code = '', noComment = '';
  let i = 0;
  let mode = null;                 // null | 'line' | 'block' | "'" | '"' | '`' | 'regex'
  let inClass = false;             // inside a regex [...] character class
  const frames = [];               // template frames re-entered through ${…}
  let braceDepth = 0;              // brace depth inside the current ${…}
  let prevSig = '';                // last significant CODE character
  let word = '';                   // the identifier currently being accumulated
  let prevWord = '';               // the identifier immediately before prevSig

  const emit = (inCode, inNoComment) => { code += inCode; noComment += inNoComment; };
  const blank = (c) => (c === '\n' ? '\n' : ' ');

  const noteCodeChar = (c) => {
    if (/\s/.test(c)) return;
    if (/[A-Za-z0-9_$]/.test(c)) { word += c; } else { if (word) prevWord = word; word = ''; }
    prevSig = c;
  };

  while (i < n) {
    const c = src[i], d = src[i + 1];

    if (mode === null) {
      if (c === '/' && d === '/') { mode = 'line'; emit('  ', '  '); i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; emit('  ', '  '); i += 2; continue; }
      if (c === '/') {
        const sig = prevSig;
        const isRegex = !sig
          || (/[A-Za-z0-9_$]/.test(sig) ? KEYWORD_BEFORE_REGEX.has(word || prevWord)
             : !(sig === ')' || sig === ']' || sig === '}'));
        if (isRegex) { mode = 'regex'; inClass = false; emit('/', '/'); i++; continue; }
        emit(c, c); noteCodeChar(c); i++; continue;
      }
      if (c === "'" || c === '"' || c === '`') {
        mode = c; if (c === '`') { frames.push(braceDepth); braceDepth = 0; }
        emit(c, c); noteCodeChar(c); i++; continue;
      }
      if (c === '}' && frames.length && braceDepth === 0) {
        // closing a `${…}` — back into the template literal that opened it
        mode = '`'; braceDepth = frames.pop(); emit(c, c); noteCodeChar(c); i++; continue;
      }
      if (c === '{') braceDepth++;
      else if (c === '}') braceDepth = Math.max(0, braceDepth - 1);
      emit(c, c); noteCodeChar(c); i++; continue;
    }

    if (mode === 'line') {
      if (c === '\n') { mode = null; emit('\n', '\n'); } else emit(' ', ' ');
      i++; continue;
    }
    if (mode === 'block') {
      if (c === '*' && d === '/') { mode = null; emit('  ', '  '); i += 2; }
      else { emit(blank(c), blank(c)); i++; }
      continue;
    }
    if (mode === 'regex') {
      if (c === '\\') { emit('  ', '  '); i += 2; continue; }
      if (c === '[') { inClass = true; emit(' ', ' '); i++; continue; }
      if (c === ']') { inClass = false; emit(' ', ' '); i++; continue; }
      if (c === '/' && !inClass) { mode = null; emit('/', '/'); prevSig = '/'; i++; continue; }
      if (c === '\n') { mode = null; emit('\n', '\n'); i++; continue; }   // unterminated: resync
      emit(' ', ' '); i++; continue;
    }
    // a string or template literal
    if (c === '\\') {
      // a line continuation carries a REAL newline; swallowing it would shift
      // every line number this guard reports after it.
      emit(d === '\n' ? ' \n' : '  ', src.slice(i, i + 2)); i += 2; continue;
    }
    if (mode === '`' && c === '$' && d === '{') {
      // an expression re-enters CODE; its braces are counted so the matching
      // `}` returns to the template rather than closing some outer block.
      mode = null; frames.push(braceDepth); braceDepth = 0;
      emit('${', '${'); prevSig = '{'; i += 2; continue;
    }
    if (c === mode) {
      mode = null; if (c === '`' && frames.length) braceDepth = frames.pop();
      emit(c, c); noteCodeChar(c); i++; continue;
    }
    emit(blank(c), c); i++; continue;
  }
  return { code, noComment, desynced: mode !== null || frames.length > 0 };
}

/** The identifier projection — comments and string interiors blanked. */
export function stripCode(src) { return stripSource(src).code; }

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

/** Every residue read/write of the property field in one source, with lines.
 *  `.homestead` catches `G.homestead`, `G_().homestead`, `state.homestead` and
 *  a `.homestead` destructure; the BRACKET form `G['homestead']` is scanned in
 *  the strings-intact projection, because its key is a string literal and the
 *  identifier projection has (correctly) blanked it away. */
export function scanResidueReads(rawSrc) {
  const { code, noComment } = stripSource(rawSrc);
  const hits = [];
  const dot = /\.\s*homestead\b/g;
  const bracket = /\[\s*['"]homestead['"]\s*\]/g;
  let m;
  while ((m = dot.exec(code))) hits.push({ line: lineOf(code, m.index), at: m.index, text: m[0].trim() });
  while ((m = bracket.exec(noComment))) hits.push({ line: lineOf(noComment, m.index), at: m.index, text: m[0].trim() });
  return hits.sort((a, b) => a.at - b.at);
}

/** Does this source reach the homestead API through the window global? */
export function usesHomesteadApi(rawSrc) {
  return /\bHearthriseHomestead\b/.test(stripCode(rawSrc));
}

/** The dead ratchet: `…homestead.tier = Math.max(…)`. Returns the offending
 *  lines. This ONE expression is what made a forged residue permanent. */
export function scanTierRatchet(rawSrc) {
  const { code, noComment } = stripSource(rawSrc);
  const re = /homestead\s*(?:\.\s*tier|\[\s*['"]tier['"]\s*\])\s*=\s*Math\s*\.\s*max\s*\(/g;
  const lines = new Set();
  let m;
  while ((m = re.exec(code))) lines.add(lineOf(code, m.index));
  re.lastIndex = 0;
  while ((m = re.exec(noComment))) lines.add(lineOf(noComment, m.index));
  return [...lines].sort((a, b) => a - b);
}

async function walkSrc() {
  const files = [];
  async function walk(rel) {
    const entries = await readdir(new URL(rel, ROOT), { withFileTypes: true });
    for (const e of entries) {
      const child = rel + e.name + (e.isDirectory() ? '/' : '');
      if (e.isDirectory()) await walk(child);
      else if (e.name.endsWith('.js')) files.push(child);
    }
  }
  await walk('src/');
  return files;
}

export async function propertyGateCensusGuard() {
  const problems = [];
  const fail = (m) => problems.push('property-gate: ' + m);

  /* ── L1 — THE MERGE RULE, EXECUTED. ─────────────────────────────────────── */
  let P;
  try {
    P = await import(new URL('src/net/property-record.js', ROOT).href);
  } catch (e) {
    fail('could not import src/net/property-record.js, so the BEHAVIOURAL half did not run: ' + (e && e.message));
    return problems;
  }
  const reset = (t, w) => P.__resetPropertyRecord(t, w);
  const rung = (key, value) => ({ kind: 'unlock', key, value, period: '' });
  /* THE THREE SHAPES A BODY CAN TAKE, named so no fixture below can accidentally
     claim more authority than the envelope it is imitating.
       env       a real hr_state_of answer: `progress` PLUS the completeness flag
                 it always ships with (proven: tests/goal-counters.mjs G7 asserts
                 `progress_truncated === false` off the real migration chain).
       envTrunc  the same, admitting the 1000-row cap bit.
       envBare   a body that carries a `progress` array and NEVER SAYS how
                 complete it is — a lean/legacy/hand-built response. It may raise
                 and it may not lower; see L1i. */
  const env = (rows) => ({ ok: true, progress: rows, progress_truncated: false });
  const envTrunc = (rows) => ({ ok: true, progress: rows, progress_truncated: true });
  const envBare = (rows) => ({ ok: true, progress: rows });

  // (a) PAIONE'S ROW. residue 2, complete server statement of rung 1 → 1, written back.
  {
    reset();
    const G = { homestead: { tier: 2 } };
    P.notePropertyUnlocks(env([rung('property:homestead', 1)]));
    const r = P.healPropertyTier(G);
    if (P.effectivePropertyTier(G) !== 1 || G.homestead.tier !== 1) {
      fail('L1a THE LIVE P1: residue 2 + a complete server rung of 1 resolved to '
        + P.effectivePropertyTier(G) + ' (residue now ' + G.homestead.tier + '), expected 1 for both. '
        + 'The residue is out-ranking the server again — every room build, worker hire and land '
        + 'purchase will bounce off prereq_property_tier and the player cannot buy their way out.');
    }
    if (!r.healed || r.lowered !== true) {
      fail('L1a the conform did not report a DOWNWARD repair: ' + JSON.stringify(r));
    }
  }

  // (b) THE b492 DIRECTION MUST SURVIVE. residue 0, server rung 1 → 1.
  {
    reset();
    const G = { homestead: { tier: 0 } };
    P.notePropertyUnlocks(env([rung('property:homestead', 1)]));
    P.healPropertyTier(G);
    if (G.homestead.tier !== 1) {
      fail('L1b the b492 UPWARD heal regressed (residue 0 + server rung 1 gave ' + G.homestead.tier
        + '): a lost residue save would demote a paid Homestead to the camp again.');
    }
  }

  // (c) ABSENCE IS NOT A CLAIM.
  {
    reset();
    const G = { homestead: { tier: 4 } };
    P.notePropertyUnlocks({ ok: true });                       // no progress array at all
    P.healPropertyTier(G);
    if (G.homestead.tier !== 4 || P.propertyTierKnown() !== false) {
      fail('L1c an UNKNOWN envelope (no `progress` array) moved the tier to ' + G.homestead.tier
        + ' / known=' + P.propertyTierKnown() + '. A pre-projection, lean or malformed answer must '
        + 'change nothing — absence is not a statement of zero.');
    }
  }

  /* (d) A TRUNCATED STATEMENT IS A FLOOR, NOT A TIER — AND IT IS THE FIRST ONE.
         The first cut of this fix failed exactly here: it stored the value and
         threw the provenance away, so a truncated FIRST envelope (the one that
         happened to drop the `property:` row) read as "owns no rung" and
         conformed a manor owner down to the Wanderer's Camp. Both orderings are
         driven, because "the record was already warm" is what hid it. */
  {
    reset();
    const G = { homestead: { tier: 4 } };
    P.notePropertyUnlocks(envTrunc([]));
    P.healPropertyTier(G);
    if (G.homestead.tier !== 4) {
      fail('L1d a `progress_truncated` envelope DEMOTED a manor owner to ' + G.homestead.tier
        + '. hr_state_of caps progress at 1000 rows; in a truncated answer an ABSENT row proves '
        + 'nothing. This is the demotion hazard b492 refused server-only over — it must stay closed.');
    }
    if (P.propertyTierExact() !== false) {
      fail('L1d a truncated statement was recorded as EXACT — the provenance is the whole guard here: '
        + 'an exact record is allowed to lower the residue, and this one has not earned that.');
    }
    P.notePropertyUnlocks(envTrunc([rung('property:keep', 4)]));
    if (P.serverPropertyTier() !== 4) {
      fail('L1d a truncated envelope must still be able to RAISE; got ' + P.serverPropertyTier());
    }
    // …and a truncated answer must not be able to UNDO an exact one either.
    reset();
    const G2 = { homestead: { tier: 2 } };
    P.notePropertyUnlocks(env([rung('property:homestead', 1)]));   // EXACT 1
    P.notePropertyUnlocks(envTrunc([]));                           // says nothing
    P.healPropertyTier(G2);
    if (G2.homestead.tier !== 1 || P.propertyTierExact() !== true) {
      fail('L1d a truncated envelope overwrote an EXACT reading (tier now ' + G2.homestead.tier
        + ', exact=' + P.propertyTierExact() + '); an incomplete answer may raise, never blunt.');
    }
  }

  /* (d2) AN ENVELOPE THAT NEVER DECLARED ITS COMPLETENESS IS A FLOOR.
         THE REGRESSION THIS CASE EXISTS FOR, found by the in-page suite hours
         after the first cut of b502: `isCompleteStatement` was written as
         "`progress_truncated !== true`", i.e. an ABSENT flag counted as a
         complete answer. One envelope fixture carrying a filler `progress: []`
         then read as "this player owns no property", conformed the tier to 0,
         and left it there — two unrelated tests (`b354` Build button,
         `WORKER-LEDGER-1` hire) went red on a capability the seed had paid for.
         A fixture found it, but the class is not fixtures: any body that carries
         a PARTIAL `progress` array without saying so — a lean or legacy
         response, a hand-assembled one, a future caller — would demote a real
         manor owner to the Wanderer's Camp, which is b492's P1 rebuilt from the
         other side.
         Requiring the flag is free in production and that is measured: every
         envelope is hr_state_of verbatim, hr_state_of builds `progress` and
         `progress_truncated` in the same object, a migration guard fails the
         deploy without both, and tests/goal-counters.mjs G7 asserts the value
         arrives as `false` off the real migration chain. RAISING is untouched;
         only LOWERING now requires the server to have said it was telling the
         whole story. */
  {
    reset();
    const G = { homestead: { tier: 4 } };
    P.notePropertyUnlocks(envBare([]));                        // "progress: []", no flag
    P.healPropertyTier(G);
    if (G.homestead.tier !== 4) {
      fail('L1d2 an envelope that never declared its completeness DEMOTED a property owner to '
        + G.homestead.tier + '. A `progress` array with no `progress_truncated` has not said how '
        + 'much of the namespace it is showing, so it may raise and may never lower — the first cut '
        + 'of this fix read absence as "complete" and took a paid capability away.');
    }
    if (P.propertyTierExact() !== false) {
      fail('L1d2 an undeclared statement was recorded as EXACT (and may therefore lower a rung). '
        + 'Only a body that states `progress_truncated: false` has earned that.');
    }
    const G2 = { homestead: { tier: 0 } };
    P.notePropertyUnlocks(envBare([rung('property:homestead', 1)]));
    P.healPropertyTier(G2);
    if (G2.homestead.tier !== 1) {
      fail('L1d2 an undeclared envelope must still RAISE (got ' + G2.homestead.tier + '); the b492 '
        + 'direction is not what this rule is tightening.');
    }
    // …and it must not blunt an EXACT reading that is already in hand.
    reset();
    const G3 = { homestead: { tier: 2 } };
    P.notePropertyUnlocks(env([rung('property:homestead', 1)]));   // EXACT 1
    P.notePropertyUnlocks(envBare([]));                            // declares nothing
    P.healPropertyTier(G3);
    if (G3.homestead.tier !== 1 || P.propertyTierExact() !== true) {
      fail('L1d2 an undeclared envelope blunted an EXACT reading (tier ' + G3.homestead.tier
        + ', exact=' + P.propertyTierExact() + ') — paione would stop being healed the moment any '
        + 'lean body landed after his hr_load.');
    }
  }

  // (e) A COMPLETE "no rung" IS a statement (hr_state_of reads permanent rows unfiltered).
  {
    reset();
    const G = { homestead: { tier: 3 } };
    P.notePropertyUnlocks(env([]));
    P.healPropertyTier(G);
    if (G.homestead.tier !== 0) {
      fail('L1e a COMPLETE statement of "no property rung" left the tier at ' + G.homestead.tier
        + '. Permanent rows are projected UNFILTERED, so an empty complete array for a rung-owning '
        + 'player is impossible — treating it as UNKNOWN is how the forged residue survives.');
    }
  }

  // (f) A CONFIRMED GRANT IS A STATEMENT (or a confirmed purchase gets rolled back).
  {
    reset();
    const G = { homestead: { tier: 1 } };
    P.notePropertyUnlocks(env([rung('property:homestead', 1)]));
    P.notePropertyGranted(2);                                   // hr_unlock_buy: applied
    G.homestead.tier = 2;
    P.healPropertyTier(G);
    if (G.homestead.tier !== 2 || P.serverPropertyTier() !== 2) {
      fail('L1f a CONFIRMED property purchase was rolled back to ' + G.homestead.tier
        + ' by the next read — notePropertyGranted must record the rung the server just applied, '
        + 'or every successful upgrade un-does itself until the following envelope lands.');
    }
    P.notePropertyGranted(1);                                   // a grant may never lower
    if (P.serverPropertyTier() !== 2) {
      fail('L1f notePropertyGranted LOWERED the record to ' + P.serverPropertyTier()
        + '; a purchase receipt is raise-only, it is not a statement about the namespace.');
    }
  }

  // (g) A prereq_property_tier REFUSAL TEACHES THE TRUE RUNG — conservatively.
  {
    reset();
    const G = { homestead: { tier: 2 } };
    P.notePropertyRefusalTier(1);                               // UNKNOWN → learn it
    P.healPropertyTier(G);
    if (P.serverPropertyTier() !== 1 || G.homestead.tier !== 1) {
      fail('L1g a prereq_property_tier refusal ({have:1}) did not teach the record (got '
        + P.serverPropertyTier() + ' / residue ' + G.homestead.tier + '). `have` IS the server\'s own '
        + 'max over the property namespace — the only authoritative reading a session whose envelope '
        + 'never carried the row can get, and what stops a player clicking into the same "no" ten times.');
    }
    reset();
    P.notePropertyUnlocks(env([rung('property:manor', 3)]));
    P.notePropertyRefusalTier(1);                               // a LATE/stale refusal must not roll back
    if (P.serverPropertyTier() !== 3) {
      fail('L1g a stale refusal rolled an established rung back to ' + P.serverPropertyTier()
        + '. Unlock gestures are latched per OFFER, so a room refusal can land after a property grant; '
        + 'the refusal ingest may only lower from UNKNOWN.');
    }
    // …but a refusal IS exact where it is allowed to land, or it could not have
    // corrected paione's screen on the first click.
    reset();
    P.notePropertyRefusalTier(1);
    if (P.propertyTierExact() !== true) {
      fail('L1g the rung learned from a refusal was recorded as a mere FLOOR, so it could never lower a '
        + 'forged residue — which is the entire point of ingesting it. `have` is computed as '
        + 'max(value) over the property namespace inside hr_unlock_buy; it is exact by construction.');
    }
  }

  /* (h) A RECEIPT PROVES "AT LEAST". A grant with nothing else observed is a
         FLOOR: it may raise a stale residue and may not lower a higher one. */
  {
    reset();
    const G = { homestead: { tier: 3 } };
    P.notePropertyGranted(1);
    P.healPropertyTier(G);
    if (G.homestead.tier !== 3 || P.propertyTierExact() !== false) {
      fail('L1h a bare purchase receipt was treated as an EXACT statement of the namespace (tier now '
        + G.homestead.tier + ', exact=' + P.propertyTierExact() + '). hr_unlock_buy says "I merged this '
        + 'rung", not "this is your maximum" — only a complete projection or a refusal says that.');
    }
    const G2 = { homestead: { tier: 0 } };
    P.healPropertyTier(G2);
    if (G2.homestead.tier !== 1) {
      fail('L1h a receipt must still RAISE a stale residue (got ' + G2.homestead.tier + '), or a '
        + 'confirmed purchase is invisible until the next envelope lands.');
    }
  }
  reset();

  /* ── L2 / L3 / L4 — THE SOURCE CENSUS. ──────────────────────────────────── */
  let files;
  try { files = await walkSrc(); }
  catch (e) { fail('could not walk src/: ' + (e && e.message)); return problems; }

  const SKIP = new Set(['src/features/smoke-test.js']);   // the harness seeds fixtures; not the game
  let residueReadFiles = 0, consumerFiles = 0, scanned = 0;
  for (const f of files) {
    if (SKIP.has(f)) continue;
    let src;
    try { src = await readFile(new URL(f, ROOT), 'utf8'); } catch (e) { continue; }

    /* L0 — CAN THIS GUARD SEE THIS FILE AT ALL? A stripper that loses the
       thread on a regex literal blanks everything after it and then reports a
       spotless census of nothing; that is exactly what the borrowed stripper
       did to legacy.js (~15,200 of 21,452 lines invisible, including the
       wiring L5 asserts). Cheap, absolute, and it fails the build. */
    const strip = stripSource(src);
    scanned++;
    if (strip.desynced) {
      fail(`L0 the source scanner ended INSIDE a string/comment/template in ${f} — it lost the thread `
        + `somewhere in the file, so everything it reports about ${f} below (the residue reads, the `
        + `consumer classification, the ratchet, the wiring) is the census of a blank page. Fix the `
        + `scanner (stripSource) before trusting a green run.`);
    }
    {
      const srcLines = src.split('\n').length;
      const liveLines = strip.code.split('\n').filter((l) => l.trim()).length;
      const rawLive = src.split('\n').filter((l) => l.trim()).length;
      if (rawLive > 200 && liveLines < rawLive * 0.15) {
        fail(`L0 ${f}: the scanner kept only ${liveLines} of ${rawLive} non-blank lines (${srcLines} total). `
          + `A file that is 85%+ comment and string is possible, but it is far more likely the scanner `
          + `desynced quietly — treat this as blindness until proven otherwise.`);
      }
    }

    // L2 — the residue read census.
    const reads = scanResidueReads(src);
    if (reads.length) {
      residueReadFiles++;
      if (!RESIDUE_READ_OWNERS.has(f)) {
        fail(`L2 ${f} reads the RESIDUE property field directly (line${reads.length > 1 ? 's' : ''} `
          + `${reads.map((h) => h.line).join(', ')}). \`G.homestead\` is a self-only cache the server `
          + `derives no authority from; a second reader is a second source of the property rung, which `
          + `is the exact shape of both live P1s (b492 residue behind the server, b502 residue ahead of `
          + `it). Read the rung through window.HearthriseHomestead.getTier() — it conforms to the server `
          + `record on every call — or, if this file is genuinely part of the rung's own machinery, add `
          + `it to RESIDUE_READ_OWNERS here with the reason.`);
      }
    }

    // L3 — the consumer census.
    if (usesHomesteadApi(src)) {
      consumerFiles++;
      if (!CONSUMERS.has(f)) {
        fail(`L3 ${f} consumes window.HearthriseHomestead but is not classified in CONSUMERS. Say which `
          + `it is — DISPLAY (the number is only rendered) or CAPABILITY (it decides whether an action is `
          + `permitted, or what it pays) — and why. The classification is the point: a capability read `
          + `must come from the server record via getTier(), and stating that is how the next author `
          + `learns it before shipping a second source of the tier.`);
      }
    }

    // L4 — the ratchet.
    const ratchet = scanTierRatchet(src);
    if (ratchet.length) {
      fail(`L4 ${f}:${ratchet.join(',')} writes the property tier through Math.max(). THAT expression is `
        + `what made paione's forged residue permanent: a client at tier 2 with a server rung of 1 could `
        + `never write the 1 back, so the House named a property he did not own and every build bounced. `
        + `Write the rung being recorded (\`= idx\`) from a position that owns it — the server's confirmed `
        + `ok, or a client-authoritative session.`);
    }
  }
  if (residueReadFiles === 0) {
    fail('L2 the residue scanner found NO `.homestead` reads anywhere under src/. Either the field was '
      + 'renamed (update this guard) or the scanner is blind — in which case L2 passed for free.');
  }
  if (consumerFiles < 3) {
    fail('L3 the consumer scanner found only ' + consumerFiles + ' file(s) using HearthriseHomestead. '
      + 'The API has always had several consumers; a count this low means the scanner is blind.');
  }
  for (const f of RESIDUE_READ_OWNERS.keys()) {
    if (!files.includes(f)) fail(`L2 RESIDUE_READ_OWNERS names ${f}, which no longer exists — the census `
      + `describes a codebase nobody is running.`);
  }
  for (const f of CONSUMERS.keys()) {
    if (!files.includes(f)) fail(`L3 CONSUMERS names ${f}, which no longer exists.`);
  }

  /* ── L5 — THE WIRING. Each of these is a call the fix depends on; without it
     the behaviour above is correct in isolation and dead in the product. ──── */
  const WIRING = [
    ['src/features/homestead.js', /healPropertyTier\s*\(/,
      'features/homestead.js getTier() must call healPropertyTier — it is the ONE read every '
      + 'property-gated number funnels through, and the conform happens there so it cannot lose a race '
      + 'with the residue hydrate.'],
    ['src/features/homestead.js', /notePropertyGranted\s*\(/,
      'features/homestead.js upgradeProperty must call notePropertyGranted on the server\'s ok, or the '
      + 'next getTier() conforms the just-bought rung straight back down.'],
    ['src/legacy.js', /notePropertyRefusalTier\s*\(/,
      'legacy.js hrClassifyUnlock — the ONE place every unlock verdict is read — must ingest a '
      + 'prereq_property_tier refusal, so a session whose envelope never carried the row still learns '
      + 'the true rung from the server\'s own "no".'],
    ['src/net/client-state.js', /notePropertyUnlocks\s*\(/,
      'client-state.js applyClientState must observe the rung on the BOOT hr_load — an idle boot answers '
      + '{accrued:false} and applyEnvelopeState never runs (the b477 invisible-crew class).'],
    ['src/net/accrue.js', /notePropertyUnlocks\s*\(/,
      'accrue.js applyEnvelopeState must observe the rung on every settle envelope.'],
  ];
  for (const [file, re, why] of WIRING) {
    let src = '';
    try { src = await readFile(new URL(file, ROOT), 'utf8'); } catch (e) { /* reported below */ }
    if (!re.test(stripCode(src))) fail('L5 ' + why + ' (no match for ' + re + ' in ' + file + ')');
  }

  /* ── L6 — THE CONTROL. Prove each scanner still SEES its defect. A guard that
     cannot demonstrate failure is broken, not passing. ────────────────────── */
  {
    const c = [];
    if (scanResidueReads('const t = G.homestead.tier; if (t < need) return false;').length !== 1) {
      c.push('scanResidueReads no longer sees a direct `G.homestead.tier` gate read');
    }
    if (scanResidueReads("const t = G['homestead'].tier;").length !== 1) {
      c.push('scanResidueReads no longer sees the bracket form');
    }
    if (scanResidueReads('// G.homestead.tier is residue\nconst s = "the G.homestead tier";').length !== 0) {
      c.push('scanResidueReads is matching code-shaped text inside comments/strings (stripSource regressed)');
    }
    if (scanTierRatchet('G.homestead.tier = Math.max(Number(G.homestead.tier) || 0, idx);').length !== 1) {
      c.push('scanTierRatchet no longer sees the b502 ratchet');
    }
    if (scanTierRatchet('G.homestead.tier = idx;').length !== 0) {
      c.push('scanTierRatchet flags a plain SET — it would fail the fix itself');
    }
    if (!usesHomesteadApi('window.HearthriseHomestead.getTier()')) {
      c.push('usesHomesteadApi no longer sees a consumer');
    }
    if (usesHomesteadApi('/* window.HearthriseHomestead.getTier() */')) {
      c.push('usesHomesteadApi matches a commented-out consumer');
    }
    /* THE REGRESSION THAT MADE THIS GUARD LIE. A regex literal carrying a quote
       used to flip the stripper into string mode for the rest of the file. Each
       of these keeps CODE AFTER the hazard visible — which is the property that
       actually matters, and the one the borrowed stripper failed. */
    const afterRegex = 'var q = s.replace(/[\'"]/g, "");\nconst t = G.homestead.tier;';
    if (scanResidueReads(afterRegex).length !== 1) {
      c.push('a regex literal containing a quote blinds the scanner to the REST of the file '
        + '(this is the exact defect that hid legacy.js from L2/L5)');
    }
    const afterDivision = 'var half = (a + b) / 2;\nconst t = G.homestead.tier;';
    if (scanResidueReads(afterDivision).length !== 1) {
      c.push('a plain division was parsed as a regex literal — the scanner swallows real code');
    }
    if (scanResidueReads('const html = `<b>${G.homestead.tier}</b>`;').length !== 1) {
      c.push('a `${…}` expression inside a template literal is being read as string text, so any gate '
        + 'written inside an interpolation is invisible');
    }
    if (scanResidueReads('const s = `no code here`;\nconst t = G.homestead.tier;').length !== 1) {
      c.push('a template literal blinds the scanner to the code after it');
    }
    if (stripSource('const t = 1;').desynced) {
      c.push('stripSource reports a desync on ordinary code — it would fail every file');
    }
    if (!stripSource('const s = "unterminated').desynced) {
      c.push('stripSource does NOT report a desync on an unterminated string — the blindness detector '
        + 'is switched off, and a scanner that cannot notice it is blind is worse than no scanner');
    }
    for (const m of c) fail('L6 SELF-CHECK: ' + m + ' — the census above passed for free.');
  }

  if (!problems.length) {
    console.log(`Property gate census — merge rule proven in both directions (exact sets, floor raises, `
      + `absence moves nothing); ${scanned} source(s) scanned with the thread intact, `
      + `${RESIDUE_READ_OWNERS.size} residue owner(s), ${CONSUMERS.size} classified consumer(s) `
      + `(${[...CONSUMERS.values()].filter((c) => c.kind === 'CAPABILITY').length} capability, `
      + `${[...CONSUMERS.values()].filter((c) => c.kind === 'DISPLAY').length} display); `
      + `ratchet absent; wiring present.`);
  }
  return problems;
}

// CLI
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const problems = await propertyGateCensusGuard();
  if (problems.length) { for (const p of problems) console.error('  ✗ ' + p); process.exit(1); }
  process.exit(0);
}
