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
/* Where the outgoing page records what it put on the wire. localStorage, not a
   page variable: the document that makes the writes under test is destroyed by
   the switch's own reload (see pagehideRaceGuard). */
const WIRE_LOG_KEY = 'hr:test:b372-wire';
/* The outgoing character's fingerprint, carried in a RESIDUE field so it rides
   the one save the armed game still makes. */
const OUTGOING_MARK = 'OUTGOING-b372';

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
   reload in a REAL browser and reads what the outgoing page actually SENT while
   it was being torn down — the only observation that answers "what does the
   next boot find?" without any simulation in the loop.

   ── WHAT B515 DID TO THIS GUARD, AND WHERE THE PROPERTY LIVES NOW ───────────
   The observation above used to be `localStorage[SAVE_KEY]`: the outgoing G
   written back by legacy.js's pagehide `saveLocal()`. b515 RETIRED that write —
   `saveLocal()` is now one `G.lastSeen` stamp and nothing else — so the
   duplication became UNOBSERVABLE through the blob, and this guard's own
   `--mutate` proof reported MUTATION SURVIVED: the latch could be neutered with
   every assertion still green. A guard that cannot go red is decoration.

   THE LATCH IS NOT DEAD CODE, THOUGH — it moved surface with the data. Its two
   live readers are both in src/net/sync.js, and they defend the write that
   REPLACED the blob (the residue PUT, `hr_put_client_state`):
     · snapshotIfDue() §b372 — `if (switchQuiesced()) return false;` stops a NEW
       pagehide send starting from a page whose slot pointer has already moved;
     · ownerSlotForLiveG() — addresses one already in flight to the OUTGOING slot.
   And the hazard is unchanged: the residue body is addressed by
   `resolveActiveSlot(pinnedSlot)` (client-state.js buildClientStatePutRequest),
   which reads HearthriseProfile.activeSlot() LIVE — i.e. the INCOMING slot
   during the window. Neuter the latch and the outgoing character's residue
   (bestiary, quests, achievements, playerName…) is upserted onto the TARGET
   hero's client_state row. Same bug, same window, current field.

   SO THIS GUARD NOW WATCHES THE WIRE. Sync is configured with a fake endpoint
   and the page's `fetch` records every hr_put_client_state call into
   localStorage (synchronously, so a keepalive send during teardown is still
   logged), stamped with the slot in the body AND the live activeSlot at call
   time. A CONTROL send before the switch proves the harness can produce a PUT
   at all — without it "no PUT happened" would pass against a page that could
   never send one, which is the vacuity failure this repo keeps meeting.

   MUTATION: the latch is neutered in-page (`saveQuiesced -> false`,
   `quiescedOutgoingSlot -> null`), which is exactly the pre-fix build, and the
   guard must go RED — the pagehide PUT escapes, addressed to the target. */
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

    const setup = await page.evaluate(async ({ mutate, LOG, MARK }) => {
      const P = window.HearthriseProfile;
      P.init();
      window.G.gems = 5000;
      // gold-arm: stamp the armed balance via the REAL applyRecord path so
      // unlockSlot's affordability read is KNOWN (as it is post-hr_load in prod).
      if (window.HearthriseRecord) { try { window.HearthriseRecord.applyRecord(window.G, { ok: true, version: Date.now(), now: new Date().toISOString(), state: { gold: window.G.gold, gems: window.G.gems } }); } catch (e) {} }
      const r = P.unlockSlot(1);
      /* b537 — AND THE SERVER'S OWN ANSWER, because the residue `unlockSlot`
         writes is no longer allowed to gate a switch (multi-character.js
         residueCount() fails safe to slot 0 while hr_state_of is silent, which
         it always is on this signed-out harness). Without this the switch under
         test is refused as 'unconfirmed' and every assertion below passes or
         fails for the wrong reason. */
      if (typeof P.adoptServerSlots === 'function') P.adoptServerSlots([0, 1]);

      /* ── THE WIRE RECORDER ────────────────────────────────────────────────
         Written through localStorage, not a JS variable, because the page under
         observation is about to be REPLACED by a real reload: a send made during
         `pagehide` has to leave its evidence somewhere the next document can
         read. `setItem` is synchronous, and the recorder logs BEFORE handing back
         a response, so a keepalive request fired inside the teardown is recorded
         even though its promise never settles.
         Only hr_put_client_state is intercepted; everything else (the page's own
         asset and Supabase traffic) goes to the real fetch untouched. */
      localStorage.removeItem(LOG);
      const realFetch = window.fetch;
      window.fetch = function (u, init) {
        const href = String((u && u.url) || u || '');
        if (/hr_put_client_state/.test(href)) {
          let body = null;
          try { body = JSON.parse((init && init.body) || 'null'); } catch (e) {}
          try {
            const rows = JSON.parse(localStorage.getItem(LOG) || '[]');
            rows.push({
              at: Date.now(),
              slot: body ? body.p_slot : null,          // where the RPC will write
              active: P.activeSlot(),                    // where the pointer was standing
              name: (body && body.p_patch) ? body.p_patch.playerName : null,
              keepalive: !!(init && init.keepalive),
            });
            localStorage.setItem(LOG, JSON.stringify(rows));
          } catch (e) {}
          return Promise.resolve(new Response('{"ok":true}',
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return realFetch.apply(this, arguments);
      };

      /* A recognisable OUTGOING character, in a field the residue actually
         carries (`playerName` is in RESIDUE_FIELDS; `gold` is authority and is
         NOT in the bag, so it can only ever prove the retired blob). If these
         bytes turn up addressed to slot 1, the character was duplicated. */
      window.G.playerName = MARK;
      window.G.gold = 424242;
      window.saveLocal();

      /* ── SYNC, CONFIGURED FOR REAL ─────────────────────────────────────────
         The previous version stubbed `snapshotIfDue` to a resolved promise so
         the pre-swap flush would answer on this signed-out page — which deleted
         the function whose quiesce gate is the thing under test. Configuring the
         real one against the fake transport answers the flush AND leaves the
         gate in the path.
         `slot: null` is deliberate and is production's own default (auth.js
         passes no slot): the addressing then resolves LIVE on every call, which
         is exactly the hazard b372 is about. No `endpoint` is given, so the
         event flush and the boot probe stay off — only the save path is armed.
         A boot that is still holding snapshots (the reconcile gate) would refuse
         every send for a reason that has nothing to do with the latch, so the
         hold is read and released explicitly, and reported. */
      const S = window.HearthriseSync;
      const held = (S && typeof S.isSnapshotHeld === 'function') ? S.isSnapshotHeld() : null;
      if (held && typeof S.releaseSnapshots === 'function') S.releaseSnapshots();
      S.setupSync({
        snapshotEndpoint: 'https://hr-slot-switch.invalid/rest/v1/game_saves',
        apiKey: 'anon-test', authToken: () => 'test-jwt', slot: null,
      });
      /* THE CONTROL, measured before any switch: a residue PUT is reachable on
         this page, and it addresses the character that is live (slot 0). */
      const control = await S.snapshotIfDue(true, true);

      if (mutate) {
        P.saveQuiesced = function () { return false; };          // the pre-b372 build
        P.quiescedOutgoingSlot = function () { return null; };
      }
      localStorage.removeItem('hearthrise:char:1');              // target slot EMPTY — the live repro
      let wire = [];
      try { wire = JSON.parse(localStorage.getItem(LOG) || '[]'); } catch (e) {}
      return { ok: !!(r && r.ok), active: P.activeSlot(), quiesceApi: typeof P.saveQuiesced === 'function',
        control: control, held: held, wire: wire };
    }, { mutate: MUTATE, LOG: WIRE_LOG_KEY, MARK: OUTGOING_MARK });
    if (!setup.ok || setup.active !== 0) {
      problems.push(`could not reach a two-character account on slot 0 (${JSON.stringify(setup)}) — nothing was tested`);
      return problems;
    }
    if (!setup.quiesceApi && !MUTATE) {
      problems.push('HearthriseProfile.saveQuiesced() does not exist — the switch has no way to stop the '
        + 'pagehide autosave, which is the b372 duplication bug');
    }
    /* THE CONTROL, READ BEFORE THE SWITCH. Everything below is of the form "no
       residue PUT escaped"; an unreachable save path would satisfy that without
       testing anything, so the harness proves it can produce one first — and
       that the one it produced is addressed to the character that is live. */
    const control = (setup.wire || []).filter((w) => w.slot === 0 && w.active === 0);
    if (setup.control !== true || control.length === 0) {
      problems.push('the harness could not make a residue PUT (hr_put_client_state) happen at all before the '
        + `switch (snapshotIfDue returned ${JSON.stringify(setup.control)}, wire ${JSON.stringify(setup.wire)}, `
        + `snapshotHold ${JSON.stringify(setup.held)}) — every "nothing escaped" assertion below would be `
        + 'vacuous, exactly the way this guard silently stopped testing the duplication when b515 retired the blob');
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

    const after = await page.evaluate(({ LOG }) => {
      let live = null;
      try { live = JSON.parse(localStorage.getItem('hearthbound-save-v2') || 'null'); } catch (e) {}
      let wire = [];
      try { wire = JSON.parse(localStorage.getItem(LOG) || '[]'); } catch (e) {}
      return {
        active: window.HearthriseProfile.activeSlot(),
        liveGold: live ? live.gold : null,
        liveSlot: live ? live._saveSlot : null,
        gGold: window.G && window.G.gold,
        wire: wire,
      };
    }, { LOG: WIRE_LOG_KEY });

    if (after.active !== 1) {
      problems.push(`the switch did not land on slot 1 (active ${after.active}) — the duplication assertions below `
        + 'would be vacuous');
    } else if (after.wire.length < (setup.wire || []).length) {
      /* The evidence has to survive the navigation, or "nothing escaped" is just
         a lost log. Checked against what was already recorded before the switch. */
      problems.push(`the wire log did not survive the reload (${(setup.wire || []).length} rows before, `
        + `${after.wire.length} after) — the observation this guard depends on was destroyed, so its verdict `
        + 'means nothing');
    } else {
      /* ── THE b372 PROPERTY, ON THE FIELD THAT HOLDS THE DATA TODAY ─────────
         A residue PUT sent while the pointer already stands on the target is
         the outgoing character being written into the target's row: layer 1
         (snapshotIfDue's quiesce gate) should have stopped it from starting,
         and layer 2 (ownerSlotForLiveG) should have re-addressed anything
         already in flight. Both are read off the same evidence. */
      const escaped = after.wire.filter((w) => w.active !== 0 || w.slot !== 0);
      for (const w of escaped) {
        problems.push('THE b372 DUPLICATION, ON THE WIRE: a residue PUT (hr_put_client_state) left the outgoing '
          + `page during the switch addressed to slot ${w.slot} while the pointer stood on slot ${w.active} `
          + `(keepalive ${w.keepalive}, playerName ${JSON.stringify(w.name)}). client_state is UNIQUE `
          + "(user_id, slot), so that upsert overwrites the TARGET hero's residue with the outgoing "
          + "character's — one hero cloned, the hero that lived there destroyed. The switch quiesce latch "
          + '(HearthriseProfile.saveQuiesced) is what must stop it.');
      }
      /* THE RETIRED BLOB, still checked — cheaply, and no longer as the
         duplication test. b515 deleted the write that made these bite (saveLocal
         is a `lastSeen` stamp now), so a green here proves the blob stayed
         retired through a switch, nothing more. The wire above is the property. */
      if (after.liveGold === 424242 || after.gGold === 424242) {
        problems.push('THE b372 DUPLICATION VIA THE BLOB: the outgoing character (gold 424242) is in '
          + `localStorage/${after.gGold === 424242 ? 'memory' : 'the live save'} after switching to an EMPTY hero `
          + 'slot — a local blob is writing again (b515 retired it) and the next boot adopts it as the target hero');
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
      // gold-arm: stamp the armed balance via the REAL applyRecord path (see above).
      if (window.HearthriseRecord) { try { window.HearthriseRecord.applyRecord(window.G, { ok: true, version: Date.now(), now: new Date().toISOString(), state: { gold: window.G.gold, gems: window.G.gems } }); } catch (e) {} }
      const r = P.unlockSlot(1);                      // direct: the buy dialog is tested separately
      // b537: the server projection is the switch gate now — state it (see the first check).
      if (typeof P.adoptServerSlots === 'function') P.adoptServerSlots([0, 1]);
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
