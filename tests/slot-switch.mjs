// ============================================================================
// tests/slot-switch.mjs — THE SLOT SWITCH MAY NEVER FREEZE THE TAB (b371).
//
// THE INCIDENT, verbatim from live play (3/3 repro): clicking "Play" on a
// second hero slot HARD-FROZE the entire tab. Input dispatch and script
// injection both timed out for 60+ seconds, there was no self-recovery, and a
// manual reload was the only way out. Two of the three repros landed inside a
// database restart window, so a slow server made it likelier — but a server
// blip must never be able to brick a client.
//
// THE MECHANISM, reproduced before it was fixed: `HearthriseProfile.selectSlot`
// asked `window.confirm(...)`. A native JS dialog BLOCKS THE RENDERER'S MAIN
// THREAD until it is answered — every timer, every paint, every input handler
// in the game stops — and a dialog that is never answered (suppressed, raised
// while the tab is not frontmost, buried behind an OS window) blocks it
// forever. Driven under Playwright with the dialog deliberately left unanswered,
// the page stopped answering `page.evaluate` and `locator.click` for the entire
// life of the harness (>4 minutes). That is the reported symptom exactly.
//
// WHY THIS IS A NODE GUARD AND NOT AN IN-PAGE TEST — two reasons, both fatal to
// an in-page version:
//   1. The property under test is "the MAIN THREAD stayed responsive". Code
//      running ON that thread cannot observe it stopping. Only an out-of-process
//      driver can, which is what `page.evaluate` racing a wall-clock timeout is.
//   2. `tryRun` in the in-page suite takes its test function's RETURN value, so
//      an async test records PASS before it has asserted anything. The whole
//      point here is a wait.
//
// WHAT IT PINS
//   A. No native dialog is EVER raised by the switch path (the freeze class).
//   B. With a transport that never resolves, the main thread keeps ticking
//      throughout — measured by a heartbeat interval read from out of process.
//   C. That switch ends in a bounded, NAMED failure that the player is told
//      about, with the game left in a responsive, unchanged state (still on the
//      old character, busy latch cleared, no reload).
//   D. Source: `confirm(` may not come back to src/multi-character.js.
//
// MUTATION (`--mutate`): the pre-fix implementation is put back into the page —
// `window.confirm` + a synchronous swap — and the guard must go RED. Without
// that, "no dialog was raised" also passes against a harness that never clicked
// anything, which is the vacuity failure this repo has met repeatedly.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const HEARTBEAT_MS = 100;
/* Long enough to cover the 6s in-app flush timeout plus the modal round trip;
   short enough that a genuine freeze is still a fast red. */
const OBSERVE_MS = 12_000;
/* If one out-of-process read of the heartbeat takes longer than this, the main
   thread was not answering. The real freeze took >4 minutes; anything over a
   second here is already a broken frame budget. */
const EVAL_BUDGET_MS = 2_000;

async function sourceGuard(root) {
  const problems = [];
  const src = await readFile(join(root, 'src', 'multi-character.js'), 'utf8');
  /* COMMENTS ARE STRIPPED FIRST, deliberately. The block that explains the
     incident names `confirm()` on purpose, and a guard that fired on its own
     documentation would be deleted by the next person to touch the file. Only a
     CALL counts. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const calls = [...code.matchAll(/(?:^|[^.\w])(?:window\.)?confirm\s*\(/gm)];
  if (calls.length) {
    problems.push(`src/multi-character.js calls confirm() again (${calls.length}×) — a native dialog blocks `
      + 'the renderer main thread until answered, which is the b371 freeze. Use HearthriseProfile.confirmDialog().');
  }
  if (!/confirmDialog/.test(src)) {
    problems.push('src/multi-character.js no longer has confirmDialog() — the non-blocking confirm is gone, '
      + 'so something is asking the player a question by some other means');
  }
  return problems;
}

/* ════════════════════════════════════════════════════════════════════════
   b372 — AND THE SWITCH MAY NEVER DUPLICATE THE CHARACTER.

   THE INCIDENT (live FTUE run, b371, reproduced on Tyler's account): switching
   to hero slot 1 put a COPY of the slot-0 character there and destroyed the
   save that had been in it. `switchSlot` clears SAVE_KEY for an empty target
   and calls `location.reload()`; the reload fires `pagehide`, and the page
   still holds the OUTGOING character in `window.G`, so legacy.js's pagehide
   autosave writes it straight back into SAVE_KEY — under the new slot — and
   sync.js's pagehide snapshot uploads it onto the target's game_saves row.

   WHY THIS LIVES HERE AND NOT ONLY IN THE IN-PAGE SUITE: the in-page test has
   to simulate the teardown (it dispatches a synthetic `pagehide` through a test
   seam, because `location.reload()` cannot be stubbed). This one drives a REAL
   reload in a REAL browser and reads what actually survived in localStorage
   afterwards — the only observation that answers "what does the next boot
   find?" without any simulation in the loop.

   MUTATION: the latch is neutered in-page (`saveQuiesced -> false`), which is
   exactly the pre-fix build, and the guard must go RED. */
async function pagehideRaceGuard(browser, url, opts = {}) {
  const MUTATE = !!opts.mutate;
  const problems = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => typeof window.G !== 'undefined' && !!window.HearthriseProfile,
      { timeout: 60_000 });
    await page.waitForTimeout(4_000);

    const setup = await page.evaluate(({ mutate }) => {
      const P = window.HearthriseProfile;
      P.init();
      window.G.gems = 5000;
      const r = P.unlockSlot(1);
      /* The switch refuses to swap unless the outgoing character's cloud flush
         answers, and this harness is signed out. Answering it is not what is
         under test here — the pagehide writes AFTER the swap are. */
      if (window.HearthriseSync && typeof window.HearthriseSync.snapshotIfDue === 'function') {
        window.HearthriseSync.snapshotIfDue = function () { return Promise.resolve(true); };
      }
      /* A recognisable OUTGOING character. If these bytes turn up under slot 1
         after the switch, the character was duplicated. */
      window.G.gold = 424242;
      window.saveLocal();
      if (mutate) {
        P.saveQuiesced = function () { return false; };          // the pre-b372 build
        P.quiescedOutgoingSlot = function () { return null; };
      }
      localStorage.removeItem('hearthrise:char:1');              // target slot EMPTY — the live repro
      return { ok: !!(r && r.ok), active: P.activeSlot(), quiesceApi: typeof P.saveQuiesced === 'function' };
    }, { mutate: MUTATE });
    if (!setup.ok || setup.active !== 0) {
      problems.push(`could not reach a two-character account on slot 0 (${JSON.stringify(setup)}) — nothing was tested`);
      return problems;
    }
    if (!setup.quiesceApi && !MUTATE) {
      problems.push('HearthriseProfile.saveQuiesced() does not exist — the switch has no way to stop the '
        + 'pagehide autosave, which is the b372 duplication bug');
    }

    /* THE REAL SWITCH, WITH THE REAL RELOAD. Not awaited in-page — the
       navigation is the point. */
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 60_000 }).catch(() => null),
      page.evaluate(() => { window.HearthriseProfile.switchSlotAsync(1); }),
    ]);
    await page.waitForFunction(() => typeof window.G !== 'undefined' && !!window.HearthriseProfile,
      { timeout: 60_000 });
    await page.waitForTimeout(3_000);

    const after = await page.evaluate(() => {
      let live = null;
      try { live = JSON.parse(localStorage.getItem('hearthbound-save-v2') || 'null'); } catch (e) {}
      return {
        active: window.HearthriseProfile.activeSlot(),
        liveGold: live ? live.gold : null,
        liveSlot: live ? live._saveSlot : null,
        gGold: window.G && window.G.gold,
      };
    });

    if (after.active !== 1) {
      problems.push(`the switch did not land on slot 1 (active ${after.active}) — the duplication assertions below `
        + 'would be vacuous');
    } else {
      if (after.liveGold === 424242) {
        problems.push('THE b372 DUPLICATION: after switching to an EMPTY hero slot, the live save is the OUTGOING '
          + "character (gold 424242). The pagehide autosave fired during the switch's own reload and wrote slot 0's "
          + 'character under slot 1 — one hero cloned, the hero that lived in the target destroyed.');
      }
      if (after.gGold === 424242) {
        problems.push('the character now being PLAYED on slot 1 is the slot-0 character (gold 424242) — the clone '
          + 'survived boot and the next autosave uploads it over slot 1\'s cloud save');
      }
      if (after.liveSlot != null && after.liveSlot !== 1) {
        problems.push(`the live save is stamped for hero slot ${after.liveSlot} while slot 1 is active — a save `
          + 'from another character is live');
      }
    }

    if (MUTATE) {
      if (problems.length) for (const p of problems) console.log('   [mutation caught by] ' + p.slice(0, 150));
      return problems.length ? []
        : ['MUTATION SURVIVED: the quiesce latch was neutered (saveQuiesced -> false), which is the pre-b372 build, '
           + 'and this guard still passed. It is not testing the duplication.'];
    }
  } catch (err) {
    problems.push('pagehide-race harness failure: ' + err.message);
  } finally {
    await ctx.close().catch(() => {});
  }
  return problems;
}

export async function slotSwitchGuard(browser, url, opts = {}) {
  const MUTATE = !!opts.mutate;
  const problems = await sourceGuard(opts.root);
  /* KEPT SEPARATE, not merged into `problems`. Under --mutate the freeze block
     below reads `problems.length` as "the mutant died", and a duplication
     finding (or a SURVIVED report) landing in that bucket would be mistaken for
     the freeze mutation being caught — and a survivor would then be swallowed
     by the very `return []` that reports success. These are two independent
     mutations of two independent fixes; they are reported independently. */
  const raceProblems = await pagehideRaceGuard(browser, url, opts);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(({ hb }) => {
    window.__HR_TEST_HARNESS__ = true;
    /* The witness. Installed before any app script runs and re-installed by
       every navigation, so a reload is visible as a reset rather than as a
       silence we might mistake for a freeze. */
    window.__beat = 0;
    window.__beatStarted = Date.now();
    setInterval(() => { window.__beat++; }, hb);
  }, { hb: HEARTBEAT_MS });

  const dialogs = [];
  page.on('dialog', async (d) => {
    dialogs.push({ type: d.type(), message: d.message() });
    /* Answered ONLY so the harness itself can finish and report. In the fixed
       build this listener must never fire at all. */
    if (MUTATE) { await new Promise((r) => setTimeout(r, 3_000)); }
    await d.accept().catch(() => {});
  });

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(
      () => typeof window.G !== 'undefined' && !!window.HearthriseProfile && !!window.HearthriseHome,
      { timeout: 60_000 });
    await page.waitForTimeout(4_000);

    // ── Become a player with two characters, on the first one ──────────────
    const setup = await page.evaluate(() => {
      const P = window.HearthriseProfile;
      P.init();
      window.G.gems = 5000;
      const r = P.unlockSlot(1);                      // direct: the buy dialog is tested separately
      return { ok: !!(r && r.ok), active: P.activeSlot(), rows: P.slotRows().length };
    });
    if (!setup.ok || setup.active !== 0) {
      problems.push(`the harness could not reach a two-character account (${JSON.stringify(setup)}) — nothing below was tested`);
      return problems;
    }

    // ── A transport that never answers. This is the DB-restart window ──────
    const armed = await page.evaluate(({ mutate }) => {
      window.__notices = [];
      const realNotify = window.notify;
      window.notify = function (msg, kind) {
        window.__notices.push(String(msg));
        try { return realNotify.apply(this, arguments); } catch (e) { return null; }
      };
      let hadSync = false;
      if (window.HearthriseSync && typeof window.HearthriseSync.snapshotIfDue === 'function') {
        hadSync = true;
        window.HearthriseSync.snapshotIfDue = function () { return new Promise(() => {}); };
      }
      if (mutate) {
        /* THE PRE-FIX IMPLEMENTATION, restored verbatim in shape: a native
           confirm on the main thread, then a synchronous swap. */
        window.HearthriseProfile.selectSlot = function (id) {
          const p = this.profile;
          if (!p || id === p.activeSlot) return false;
          if (!confirm('Switch to slot ' + (id + 1) + '?')) return false;
          window.HearthriseProfile.switchSlot(id);
          return true;
        };
      }
      return { hadSync };
    }, { mutate: MUTATE });
    if (!armed.hadSync && !MUTATE) {
      problems.push('HearthriseSync.snapshotIfDue was not present to stub — the never-resolving-transport '
        + 'assertion below would pass vacuously against a switch that never waited on anything');
    }

    // ── Fire the switch the way a player does, and do NOT await it ─────────
    const t0 = Date.now();
    const beatAtStart = await page.evaluate(() => window.__beat);
    page.evaluate(() => {
      window.__switchVerdict = 'pending';
      try {
        Promise.resolve(window.HearthriseProfile.selectSlot(1)).then(
          (v) => { window.__switchVerdict = 'resolved:' + v; },
          (e) => { window.__switchVerdict = 'rejected:' + (e && e.message); });
      } catch (e) { window.__switchVerdict = 'threw:' + e.message; }
    }).catch(() => { /* in the mutated build this evaluate is itself blocked */ });

    /* THE WITNESS RUNS IN PARALLEL WITH EVERYTHING BELOW, and that is not a
       stylistic choice: if the responsiveness poll only started after the modal
       had been answered, a freeze that lasted exactly as long as the unanswered
       dialog would happen entirely before the first measurement and the guard
       would report a healthy main thread through the middle of the incident. */
    let worstEvalMs = 0;
    let stalls = 0;
    let reloaded = false;
    const observing = (async () => {
      let lastBeat = beatAtStart;
      while (Date.now() - t0 < OBSERVE_MS) {
        const at = Date.now();
        let beat = null;
        try {
          beat = await Promise.race([
            page.evaluate(() => window.__beat),
            new Promise((_, rej) => setTimeout(() => rej(new Error('main thread did not answer')), EVAL_BUDGET_MS)),
          ]);
        } catch (e) { beat = null; }
        const took = Date.now() - at;
        if (took > worstEvalMs) worstEvalMs = took;
        if (beat === null) stalls++;
        else { if (beat < lastBeat) reloaded = true; lastBeat = beat; }
        await new Promise((r) => setTimeout(r, 250));
      }
    })();

    // Answer the IN-GAME confirm (the fixed build). Retried, because the modal
    // is appended asynchronously relative to the evaluate above.
    let sawModal = false;
    for (let i = 0; i < 20 && !sawModal; i++) {
      sawModal = await page.evaluate(() => {
        const ov = document.getElementById('hr-confirm-overlay');
        if (!ov) return false;
        const yes = ov.querySelector('[data-hrc="yes"]');
        if (yes) yes.click();
        return true;
      }).catch(() => false);
      if (!sawModal) await new Promise((r) => setTimeout(r, 150));
    }
    if (!sawModal && !MUTATE) {
      problems.push('the in-game confirm modal (#hr-confirm-overlay) never appeared — either the switch asked '
        + 'nothing (a premium action with no confirmation) or it asked with something this guard cannot answer');
    }

    // ── B. THE MAIN THREAD MUST KEEP TICKING THE WHOLE TIME ────────────────
    await observing;

    if (stalls) {
      problems.push(`THE b371 FREEZE: the page stopped answering out-of-process script ${stalls}× during a slot `
        + `switch against a server that never replied (worst single read ${worstEvalMs}ms). The renderer main `
        + 'thread is blocked — no timer, no paint and no input handler in the game is running.');
    } else if (worstEvalMs > EVAL_BUDGET_MS / 2) {
      problems.push(`the main thread took ${worstEvalMs}ms to answer during the switch — not a freeze, but the `
        + 'switch path is doing something long and synchronous');
    }
    if (dialogs.length) {
      problems.push(`${dialogs.length} NATIVE dialog(s) were raised by the switch path `
        + `(${dialogs.map((d) => d.type).join(', ')}) — window.confirm/alert/prompt block the renderer until `
        + 'answered and are the freeze itself. Ask with HearthriseProfile.confirmDialog().');
    }

    // ── C. A BOUNDED, NAMED, PLAYER-VISIBLE FAILURE ────────────────────────
    const after = await page.evaluate(() => ({
      verdict: window.__switchVerdict,
      notices: window.__notices || [],
      active: window.HearthriseProfile.activeSlot(),
      switching: typeof window.HearthriseProfile.isSwitching === 'function'
        ? window.HearthriseProfile.isSwitching() : null,
      modalGone: !document.getElementById('hr-confirm-overlay'),
    })).catch((e) => ({ err: e.message }));

    if (after.err) {
      problems.push('the page could not be read at all after the switch: ' + after.err);
    } else if (!MUTATE) {
      if (after.verdict !== 'resolved:false') {
        problems.push(`selectSlot settled as "${after.verdict}" against a server that never answered — it must `
          + 'resolve false (a bounded, reported failure), not hang and not claim success');
      }
      const told = after.notices.some((n) => /couldn.t switch/i.test(n));
      if (!told) {
        problems.push('the player was never told the switch failed. Notices seen: '
          + JSON.stringify(after.notices.slice(-4)) + ' — a silent failure against an unreachable server is '
          + 'indistinguishable from the freeze it replaced');
      }
      if (after.active !== 0) {
        problems.push(`the profile moved to slot ${after.active} even though the flush never completed — a `
          + 'half-switched account is exactly the state the reload then boots into');
      }
      if (after.switching !== false) {
        problems.push('the busy latch was never cleared — every later switch attempt is now a silent no-op');
      }
      if (!after.modalGone) problems.push('the confirm modal was left on screen after the switch resolved');
      if (reloaded) problems.push('the page reloaded despite the flush failing — reloading into an unreachable '
        + 'server is how a player lands on a blank boot with nothing to click');
    }

    if (MUTATE) {
      /* The control. If the pre-fix implementation does NOT trip this guard,
         the guard is decoration. */
      const caught = problems.length > 0;
      /* Say WHAT caught it. "The mutant died" is only meaningful if it died of
         the disease under test rather than of some incidental assertion. */
      if (caught) for (const p of problems) console.log('   [mutation caught by] ' + p.slice(0, 150));
      return caught
        ? raceProblems
        : ['MUTATION SURVIVED: the pre-b371 selectSlot (window.confirm + synchronous swap) was put back and this '
           + 'guard still passed. It is not testing the freeze.', ...raceProblems];
    }
  } catch (err) {
    problems.push('harness failure: ' + err.message);
  } finally {
    await ctx.close().catch(() => {});
  }
  return problems.concat(raceProblems);
}

export default slotSwitchGuard;

/* Standalone runner, so the MUTATION can be exercised without a full suite run:
     node tests/slot-switch.mjs            (expect green)
     node tests/slot-switch.mjs --mutate   (expect green — meaning the mutant died)
   It serves the repo itself; the guard is worthless against a stale deploy. */
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
    || process.argv[1]?.endsWith('slot-switch.mjs')) {
  const { chromium } = await import('playwright');
  const { createServer } = await import('node:http');
  const { stat } = await import('node:fs/promises');
  const { extname, normalize } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json' };
  const { server, port } = await new Promise((resolve) => {
    const s = createServer(async (req, res) => {
      try {
        const p = decodeURIComponent((req.url || '/').split('?')[0]);
        let f = normalize(join(ROOT, p === '/' ? '/index.html' : p));
        if (!f.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
        const i = await stat(f).catch(() => null);
        if (i?.isDirectory()) f = join(f, 'index.html');
        res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store' }).end(await readFile(f));
      } catch { res.writeHead(404).end('not found'); }
    });
    s.listen(0, '127.0.0.1', () => resolve({ server: s, port: s.address().port }));
  });
  const mutate = process.argv.includes('--mutate');
  const browser = await chromium.launch();
  const problems = await slotSwitchGuard(browser, `http://127.0.0.1:${port}/index.html`, { root: ROOT, mutate });
  await browser.close();
  server.close();
  if (problems.length) {
    console.log(`Slot-switch guard${mutate ? ' (MUTATION)' : ''} — FAILED:`);
    for (const p of problems) console.log('  ✗ ' + p);
    process.exit(1);
  }
  console.log(`Slot-switch guard${mutate ? ' (MUTATION — the pre-b371 confirm() implementation was caught)' : ''} — green.`);
}
