// ════════════════════════════════════════════════════════════════════════
// tests/attended-fall.mjs — A DEATH THE PLAYER WATCHED IS STILL THE SERVER'S.
//
// ── WHAT WENT WRONG ─────────────────────────────────────────────────────────
// b509 shipped the Recovery Rule rev. 2 — a fall costs minutes, the character
// stands up at 40%, the run carries on. The live play-gate (QA account, slot 2,
// Auto-Eat off, Dark Wizard, 2026-09-06) proved the whole rule held for the
// AWAY path and NONE of it for the attended one:
//
//     client   "Knocked out. Back on your feet in 1:38 … you got back up at
//              40% health 5/12" — and G.playerHp was 12/12 a second later.
//     server   recovering_until NULL · hp 12/12 · no `deaths` row · no ledger
//              row · active_kind 'idle' since the instant of the death.
//
// ONE line caused all of it. The attended death ran `stopCombat()`, which
// DECLARES `idle`; hr_apply stamps `accrued_to = now()` on any activity delta,
// so the 19-second window the death happened in was closed without ever being
// simulated. The server was never asked, so the client answered — from a ladder
// rung it computed out of `G.stats.deaths`, a LIFETIME tally that nothing seeds
// `deathsTodayBefore` from. A two-minute knockout, invented, on a fall the
// server would have charged nothing for.
//
// ── THE RULE THIS GUARDS ────────────────────────────────────────────────────
// A fall stops the SWING and nothing else. The pointer survives, the window
// stays open, and the next settle prices it with the one engine that already
// handles away deaths (AWAY-12 forbids a second). The client records that it
// asked, and renders the answer — never its own guess.
//
//   F1  the phases: up → pending → recovering → down-free, off server facts.
//   F2  `pending` counts as KNOCKED OUT, so the live tick cannot swing while
//       the answer is in flight.
//   F3  a STALE envelope does not answer. `accrued_to` reaching the fall is
//       what "the server has simulated this" means — not the mere arrival of
//       an envelope, and not the presence of a recovery line (the day's first
//       fall is answered with no line at all).
//   F4  a priced window WITH a line ⇒ recovering, and the timer is the
//       server's absolute instant to the millisecond.
//   F5  a priced window with NO death ⇒ `unconfirmed`. The sheet says so; it
//       does not invent a knockout out of a client/server dice divergence.
//   F6  an unanswered fall TIMES OUT into `unconfirmed` — never into a death.
//       A silent server must not become a punishment nobody imposed.
//   F7  there is no client writer for the recovery line (RECOVER-7's rule,
//       re-asserted here because this file adds three new readers of it).
//   F8  src/legacy.js: the live death branch does not stop the run, the combat
//       tick consults the knockout gate, and a REAL stop clears the pending
//       fall.
//   F9  src/features/death-sheet.js does not resurrect the client-side timer
//       fallback, and reads the ladder off the server's own counters.
//
// ── THE MUTATION PROOF ──────────────────────────────────────────────────────
//   node tests/attended-fall.mjs              green
//   node tests/attended-fall.mjs --selftest   every mutation must turn it RED
//   node tests/attended-fall.mjs --mutate=<id>
// A mutation nothing catches is reported as SLIPPED and exits 1.
//
// Node-only, credential-free, no database, milliseconds. Mutated runs import a
// STAGED COPY of src/ (Node cannot import a string, and accrue.js resolves its
// siblings by relative path) — the same harness shape tests/delta-transport.mjs
// uses. NO ?v= on the imports below: this is tests/**, not a browser module (b332).
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile, cp, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC = (p) => join(ROOT, 'src', ...p.split('/'));

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   Every entry is a defect somebody could plausibly write — most of them by
   "simplifying" — and each names the assertion that must catch it. */
const MUTATIONS = {
  answer_ignores_watermark: {
    file: 'net/accrue.js',
    why: 'a fall is treated as ANSWERED by the mere arrival of an envelope instead of by a window '
       + 'that reaches it. The first stale sync after a death then resolves the fall as "no death", '
       + 'and the player is stood back up on a knockout the server is about to charge them for',
    find: '  if (!(accruedToAt >= fall.at)) return;',
    repl: '  if (false) return;',
  },
  envelope_ignores_accrued_to: {
    file: 'net/accrue.js',
    why: 'the `accrued_to` observer is dropped, so nothing can ever answer a pending fall. The '
       + 'character stays paused until the timeout and every fall reads UNCONFIRMED',
    find: "  if (st && Object.prototype.hasOwnProperty.call(st, 'accrued_to')) {",
    repl: '  if (false) {',
  },
  pending_is_not_down: {
    file: 'net/accrue.js',
    why: 'only a confirmed line counts as knocked out, so the live tick keeps swinging through the '
       + 'window the server has not priced yet — the client predicts past its own death, which is '
       + 'the exact state the attended path was in before this change',
    find: "  return p === 'pending' || p === 'recovering';",
    repl: "  return p === 'recovering';",
  },
  timeout_never_fires: {
    file: 'net/accrue.js',
    why: 'a fall the server never answers stays pending forever. On a flaky connection the fight is '
       + 'paused with no timer, no explanation and no way out but a reload',
    find: '  if (now - fall.at >= FALL_CONFIRM_TIMEOUT_MS) {',
    repl: '  if (false) {',
  },
  timeout_invents_a_death: {
    file: 'net/accrue.js',
    why: 'an unanswered fall resolves as though the server HAD seen a death. A silent server then '
       + 'becomes a punishment nobody imposed, and the sheet quotes a rung off counters that were '
       + 'never charged',
    find: "      serverDied: false, timedOut: true, deathsToday: deathsTodayCount,",
    repl: "      serverDied: true, timedOut: true, deathsToday: deathsTodayCount,",
  },
  death_stops_the_run: {
    file: 'legacy.js',
    why: 'THE ORIGINAL BUG, restored: an attended death declares `idle`, hr_apply stamps '
       + '`accrued_to = now()` on the activity delta, and the window the death is in is erased '
       + 'before anything can simulate it',
    find: '    if(_served) hrKnockOut(); else stopCombat();',
    repl: '    stopCombat();',
  },
  tick_swings_while_down: {
    file: 'legacy.js',
    why: 'the knockout gate is removed from the combat tick, so a knocked-out character goes on '
       + 'swinging locally through their own recovery — client damage, client loot, client death, '
       + 'none of it the server\'s',
    find: '  if(hrCombatDown())return;\n',
    repl: '',
  },
  stop_keeps_the_fall: {
    file: 'legacy.js',
    why: 'a real stop leaves the pending fall behind, so the FIRST tick of the next fight is gated '
       + 'by a question that belonged to the run before it',
    find: '  hrClearFall();\n',
    repl: '',
  },
  sheet_invents_a_timer: {
    file: 'features/death-sheet.js',
    why: 'the client-side countdown fallback is back — the sheet shows a rung the server never '
       + 'charged, which is precisely what the live play-gate photographed',
    find: '          return (AC && typeof AC.recoveringUntilMs === \'function\') ? (AC.recoveringUntilMs() || 0) : 0;\n        } catch (e) { return 0; }',
    repl: '          var t = (AC && typeof AC.recoveringUntilMs === \'function\') ? AC.recoveringUntilMs() : 0;\n'
        + '          if (t > 0) return t;\n        } catch (e) {}\n'
        + '        var rec = Number(info && info.recoverMs) || 0;\n        return rec > 0 ? (Date.now() + rec) : 0;',
  },
};

/* ── HARNESS ────────────────────────────────────────────────────────────── */
let checks = 0; let fails = 0;
const log = (m) => console.log(m);
const ok = (cond, msg) => {
  checks++;
  if (!cond) { fails++; log('  FAIL  ' + msg); }
};
const harness = (m) => { const e = new Error(m); e.harness = true; throw e; };

/** Stage src/ under a temp root and apply one mutation, or return the real
 *  tree untouched. Node cannot import a string, and accrue.js reaches its
 *  siblings by relative path, so a mutated module has to exist on disk at the
 *  same relative depth. */
async function stageSources(mutate) {
  if (!mutate) return { dir: join(ROOT, 'src'), base: null };
  const m = MUTATIONS[mutate];
  if (!m) harness(`unknown mutation "${mutate}"`);
  const base = await mkdtemp(join(tmpdir(), 'hr-fall-'));
  const dir = join(base, 'src');
  await cp(join(ROOT, 'src'), dir, { recursive: true });
  const target = join(dir, ...m.file.split('/'));
  const before = (await readFile(target, 'utf8')).replace(/\r\n/g, '\n');
  const n = before.split(m.find).length - 1;
  if (n !== 1) harness(`mutation "${mutate}" anchor matched ${n} time(s) (need exactly 1) in ${m.file}`);
  await writeFile(target, before.replace(m.find, m.repl), 'utf8');
  return { dir, base };
}

const ISO = (ms) => new Date(ms).toISOString();

/** One envelope, shaped like hr_state_of's. Only the keys under test are set —
 *  every other reader in applyEnvelopeState treats an absent key as "not
 *  stated" and leaves its target alone, which is the contract this leans on. */
function envelope(o) {
  const state = { accrued_to: ISO(o.accruedTo) };
  if ('recoveringUntil' in o) state.recovering_until = o.recoveringUntil ? ISO(o.recoveringUntil) : null;
  if ('deathsToday' in o) state.deaths_today = o.deathsToday;
  if ('deathsLifetime' in o) state.deaths_lifetime = o.deathsLifetime;
  const res = { state };
  if (o.away) res.away = o.away;
  return res;
}

export async function runAll({ mutate } = {}) {
  checks = 0; fails = 0;
  const staged = await stageSources(mutate);
  try {
    /* A cache-busting query so --selftest can import several trees in one
       process. accrue.js is DOM-free and Node-importable by design. */
    const url = pathToFileURL(join(staged.dir, 'net', 'accrue.js')).href
      + '?attended-fall=' + (mutate || 'pristine') + '-' + Date.now();
    const A = await import(url);
    for (const fn of ['noteFall', 'clearFall', 'fallState', 'isKnockedOut',
      'applyEnvelopeState', 'FALL_CONFIRM_TIMEOUT_MS']) {
      if (A[fn] === undefined) harness(`src/net/accrue.js does not export ${fn}`);
    }

    const T = 1757000000000;          // a fixed instant; nothing here reads the wall clock
    const G = {};

    /* ── F1/F2: up → pending, and pending is DOWN ─────────────────────── */
    A.clearFall();
    ok(A.fallState(T).phase === 'up',
      'F1: a character who has not fallen is not "up": ' + A.fallState(T).phase);
    ok(A.isKnockedOut(T) === false, 'F1: a character who has not fallen reads as knocked out');

    A.noteFall(T);
    ok(A.fallState(T + 1000).phase === 'pending',
      'F1: a fall the server has not priced is not PENDING: ' + A.fallState(T + 1000).phase);
    ok(A.isKnockedOut(T + 1000) === true,
      'F2: a pending fall does not read as knocked out, so the live tick would keep swinging through '
      + 'a window the server has not priced — the client predicting past its own death');

    /* ── F3: a stale envelope is not an answer ────────────────────────── */
    A.applyEnvelopeState(G, envelope({ accruedTo: T - 5000 }));
    ok(A.fallState(T + 2000).phase === 'pending',
      'F3: an envelope whose window ENDED BEFORE the fall answered it. `accrued_to` reaching the fall '
      + 'is what "the server simulated this" means: ' + A.fallState(T + 2000).phase);

    /* ── F4: the priced window, with a line ───────────────────────────── */
    A.applyEnvelopeState(G, envelope({
      accruedTo: T + 60000, recoveringUntil: T + 120000,
      deathsToday: 2, deathsLifetime: 5, away: { died: true, deaths: 1 },
    }));
    const rec = A.fallState(T + 61000);
    ok(rec.phase === 'recovering', 'F4: a priced window carrying a recovery line is not RECOVERING: ' + rec.phase);
    ok(rec.until === T + 120000,
      'F4: the timer is not the SERVER\'s absolute instant, so the sheet and the server would count '
      + 'different clocks: ' + rec.until);
    ok(rec.msLeft === 59000, 'F4: the remaining time is re-derived wrong: ' + rec.msLeft);
    ok(A.deathsToday() === 2 && A.deathsLifetime() === 5,
      'F4: the server\'s own death counters were not observed, so the sheet has to guess the ladder '
      + 'rung again: ' + A.deathsToday() + '/' + A.deathsLifetime());
    ok(A.isKnockedOut(T + 61000) === true, 'F4: a running recovery line does not read as knocked out');

    /* ── F1 (tail): the line passes and the character is UP ───────────── */
    const up = A.fallState(T + 130000);
    ok(up.phase === 'down-free' && up.serverDied === true,
      'F1: after the line passes an ANSWERED fall does not read as a confirmed, timer-free fall: ' + up.phase);
    ok(A.isKnockedOut(T + 130000) === false,
      'F1: the character is still knocked out after their own recovery line passed — the fight would '
      + 'never resume');

    /* ── F5: divergence is stated, never invented ─────────────────────── */
    A.clearFall();
    A.applyEnvelopeState(G, envelope({ accruedTo: T, recoveringUntil: null }));
    A.noteFall(T);
    A.applyEnvelopeState(G, envelope({
      accruedTo: T + 60000, recoveringUntil: null, away: { died: false, deaths: 0 },
    }));
    const div = A.fallState(T + 61000);
    ok(div.phase === 'unconfirmed' && div.serverDied === false,
      'F5: the server priced the window and saw NO death, and the client still called it a knockout. '
      + 'A dice divergence must be said out loud, not dressed as a penalty: ' + div.phase);
    ok(A.isKnockedOut(T + 61000) === false,
      'F5: an unconfirmed fall keeps the character down, so a divergence would pause the run forever');

    /* ── F6: the timeout resolves, and never into a death ─────────────── */
    A.clearFall();
    A.applyEnvelopeState(G, envelope({ accruedTo: T - 1000, recoveringUntil: null }));
    A.noteFall(T);
    ok(A.fallState(T + A.FALL_CONFIRM_TIMEOUT_MS - 1).phase === 'pending',
      'F6: the wait is abandoned before the timeout, so one missed settle loses a real knockout');
    const late = A.fallState(T + A.FALL_CONFIRM_TIMEOUT_MS);
    ok(late.phase === 'unconfirmed' && late.serverDied === false,
      'F6: an unanswered fall did not resolve as UNCONFIRMED. A silent server must not leave the '
      + 'fight paused forever, and must not be read as a death either: '
      + late.phase + '/' + late.serverDied);

    /* ── F7: no client writer for the line ────────────────────────────── */
    ok(typeof A.setRecoveringUntil === 'undefined',
      'F7: a client-side setter for the recovery line exists. This file adds three new READERS of '
      + 'that column; a writer would let a client cure its own knockout, which is the whole cost '
      + 'side of the rule');

    /* ── F8: the client half, in source ───────────────────────────────── */
    const legacy = (await readFile(join(staged.dir, 'legacy.js'), 'utf8')).replace(/\r\n/g, '\n');
    ok(legacy.includes('if(_served) hrKnockOut(); else stopCombat();'),
      'F8: the live death branch no longer chooses. Calling stopCombat() on a server-owned fall '
      + 'declares `idle`, and hr_apply stamps `accrued_to = now()` on any activity delta — the '
      + 'window the death is in is erased before anything can price it. THAT IS THE ORIGINAL BUG.');
    ok(/if\(hrCombatDown\(\)\)return;/.test(legacy),
      'F8: the combat tick no longer consults the knockout gate, so a knocked-out character keeps '
      + 'swinging locally through their own recovery');
    /* SCOPED TO THE BODY, not to a character budget. The first revision of this
       check allowed 900 characters between `function stopCombat(){` and the
       clear; b511's server-owned-HP work (34c87179) added the `_hpLocalAt`
       comment at the top of the same function and pushed the call to 1,194 —
       the guard went red while the behaviour it protects was intact, which is
       a guard that cries wolf. legacy.js closes every top-level function with a
       column-0 `}`, so the body is exactly what is matched here; the
       `stop_keeps_the_fall` mutation still turns it red. */
    const stopBody = /\nfunction stopCombat\(\)\{([\s\S]*?)\n\}/.exec(legacy);
    ok(!!stopBody, 'F8: stopCombat() is no longer a top-level function in legacy.js — this check '
      + 'cannot see its body, so it is reported as a failure rather than passing blind');
    ok(!!stopBody && stopBody[1].includes('hrClearFall();'),
      'F8: stopCombat() no longer clears the pending fall, so the question asked by the run the '
      + 'player just ended gates the first tick of the next one');

    /* ── F9: the sheet renders the server, not itself ─────────────────── */
    const sheet = (await readFile(join(staged.dir, 'features', 'death-sheet.js'), 'utf8')).replace(/\r\n/g, '\n');
    ok(!/rec\s*>\s*0\s*\?\s*\(Date\.now\(\)\s*\+\s*rec\)/.test(sheet),
      'F9: the death sheet computes a countdown from the engine\'s own `recoverMs` again. Live that '
      + 'number is garbage (`resolveDeath` adds the LIFETIME `stats.deaths` to an unseeded '
      + '`deathsTodayBefore`), and it is what put "Back on your feet in 1:38" on screen against a '
      + 'server row of NULL.');
    ok(/AC\.deathsToday\(\)/.test(sheet) && /recoveryFor\(/.test(sheet),
      'F9: the sheet no longer reads the ladder off the SERVER\'s `deaths_today` / `deaths_lifetime` '
      + 'counters, so it is back to quoting a rung nobody charged');
    ok(/fallPhase/.test(sheet),
      'F9: the sheet no longer branches on the fall PHASE. "No timer" is three different facts — a '
      + 'free first fall, an answer still in flight, and a fall the server never saw — and one '
      + 'branch tells all three the same story');
  } finally {
    if (staged.base) await rm(staged.base, { recursive: true, force: true }).catch(() => {});
  }
  return { checks, fails };
}

const main = async () => {
  const argv = process.argv.slice(2);
  const one = argv.find((a) => a.startsWith('--mutate'));
  if (one) {
    const id = one.includes('=') ? one.split('=')[1] : argv[argv.indexOf(one) + 1];
    log(`attended-fall — MUTATED: ${id}`);
    log(`  ${MUTATIONS[id] ? MUTATIONS[id].why : '(unknown)'}\n`);
    const r = await runAll({ mutate: id });
    log(`\n  ${r.checks - r.fails}/${r.checks} checks green`);
    return r.fails ? 1 : 0;
  }
  if (argv.includes('--selftest')) {
    const slipped = [];
    for (const id of Object.keys(MUTATIONS)) {
      let caught = false;
      try {
        const r = await runAll({ mutate: id });
        caught = r.fails > 0;
      } catch (e) {
        if (e.harness) { log(`HARNESS on ${id}: ${e.message}`); return 2; }
        caught = true;           // a mutation that breaks the module outright is caught
      }
      log(`${caught ? 'CAUGHT ' : 'SLIPPED'}  ${id}`);
      if (!caught) slipped.push(id);
    }
    if (slipped.length) {
      log(`\n${slipped.length} mutation(s) SLIPPED: ${slipped.join(', ')}`);
      log('A guard that cannot demonstrate it sees failure is broken, not passing.');
      return 1;
    }
    const r = await runAll();
    log(`\nall ${Object.keys(MUTATIONS).length} mutations caught; pristine run ${r.checks - r.fails}/${r.checks}`);
    return r.fails ? 1 : 0;
  }
  log('Attended fall — a death the player watched is still the server\'s');
  const r = await runAll();
  log(`\n  ${r.checks - r.fails}/${r.checks} checks green`);
  return r.fails ? 1 : 0;
};

/* ⚠ MAIN-ONLY. run-smoke.mjs imports `runAll`; a top-level run on import would
   stage a temp tree nobody asked for. */
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain) {
  main().then((c) => process.exit(c)).catch((e) => {
    console.error(e.harness ? e.message : e);
    process.exit(e.harness ? 2 : 1);
  });
}
