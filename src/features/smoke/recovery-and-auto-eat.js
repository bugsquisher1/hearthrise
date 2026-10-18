// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/recovery-and-auto-eat.js — the auto-eat settings sync, the death receipt and the Recovery Rule.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 30 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, snapshotG, drain, restoreG, stubSignedIn, on, snapshot, closeOverlays } from './_harness.js?v=592';
import { MONSTER_NOTES } from '../../data/monster-notes.js?v=592';

/* aeRig — a signed-in page whose server auto-eat belief is `state(b)`; the verb
   is stubbed and answers only when the test resolves `answer`. */
const aeApi = () => window.HearthriseAuto;
const aeRig = () => {
  const Au = aeApi(), snap = snapshotG(), origGC = window.HearthriseGoalClaim, origAcc = window.HearthriseAccrual;
  const realNotify = window.notify, before = Au.getEat();
  const wasSync = Au._parkEatSync(false), wasMirror = Au._parkAutoEatMirror(false);
  Au._resetEatSync();
  const r = { calls: [], toasts: [], answer: null };
  let belief = {}, seq = 1;
  const stamp = () => Object.assign({}, belief, { pctSeq: seq, foodSeq: seq, enabledSeq: seq });
  r.state = (b) => { belief = Object.assign({}, b); seq++; };
  window.HearthriseAccrual = Object.assign({}, origAcc, {
    serverAutoEatSettings: stamp,
    noteAutoEatVerb: (res) => { const a = res && res.ok && res.auto_eat;
      if (a) { belief = { enabled: a.enabled, food: a.food, pct: a.pct }; seq++; } return stamp(); },
    settleBeforeIntent: () => Promise.resolve(null),
  });
  window.HearthriseGoalClaim = Object.assign({}, origGC, { isSignedIn: () => true,
    setAutoEat: (p) => { r.calls.push(p); return new Promise((ok) => { r.answer = { resolve: ok }; }); } });
  window.notify = (m) => { r.toasts.push(String(m)); };
  window.G.traits = Object.assign({}, window.G.traits, { auto_eat: true });
  r.done = () => {
    Au._resetEatSync(); window.notify = realNotify;
    window.HearthriseGoalClaim = origGC; window.HearthriseAccrual = origAcc;
    Au.setEat(before); Au._resetEatSync(); Au._parkEatSync(wasSync); Au._parkAutoEatMirror(wasMirror);
    restoreG(snap);
  };
  return r;
};

/* ══ THE KO-SHEET FIXTURE (KO-*) — one self-consistent fall, both doors ═══════
   RUNG is the ladder's own price of the third fall today; the receipt's `at`
   is 30 s ago and the line ends one RUNG later, so the record is PAIRED with the
   knockout. `door2` is the accrue envelope (A.applyEnvelope), `door1` the boot
   hr_load through R.requestRecord — never applyRecord, which skips the steps.
   `reload()` is a fresh page: every module mirror and the NO_SYNC scratch go.
   Runs on the live G (legacy's binding is the one activity-resume writes), and
   `done()` restores it, the transport, the switch and the sheet together. */
const koFix = () => {
  const A = window.HearthriseAccrual, D = window.HearthriseDeathSheet, R = window.HearthriseRecord;
  const AW = window.HearthriseCore && window.HearthriseCore.away, G = window.G;
  assert(A && D && R && AW && typeof A.applyEnvelope === 'function', 'the KO seams are not wired');
  const RUNG = AW.recoveryFor({ deathsTodayBefore: 2, deathsLifetimeBefore: 8 });
  assert(RUNG > 60000, 'the fixture rung is ' + RUNG + 'ms, too short to be a running line');
  const AT = Date.now() - 30000, UNTIL = AT + RUNG, iso = (t) => new Date(t).toISOString();
  const snap = snapshotG(), realFetch = window.fetch, realAuto = window.HearthriseAuto;
  const realGC = window.HearthriseGoalClaim, wasOn = A.isServerAccrualEnabled();
  const keep = { log: G.combatLog, kills: G.combatKillsThisFoe, consec: G.consecFalls, off: G.lastOfflineSummary };
  let ver = 1000;
  const receipt = (o) => Object.assign({ grantMs: 60000, awayMs: 60000, paidMs: 30000, at: AT, gold: 0,
    xp: {}, items: {}, kills: 7, crits: 0, burnt: 0, stoppedBy: null, stoppedById: null, stoppedSkill: null,
    stoppedPerHour: 0, died: true, diedTo: 'slime', deaths: 1, recoverMs: RUNG, recoverLadder: [RUNG],
    foodEaten: 2, autoEat: { enabled: true, pct: 25, hadFood: true }, blessed: false, featuredMs: 0 }, o);
  const state = (o) => Object.assign({ slot: 0, accrued_to: iso(Date.now()), active_kind: 'combat',
    active_id: 'slime', hp: 8, max_hp: 20, recovering_until: iso(UNTIL), consec_falls: 1, deaths_today: 3,
    deaths_lifetime: 9, last_away_receipt: receipt() }, o);
  const autoOn = (on) => { window.HearthriseAuto = Object.assign({}, realAuto,
    { getEat: () => Object.assign({}, realAuto.getEat(), { enabled: on }) }); };
  const quiet = () => { try { window.stopCombat(); window.stopSkill(); } catch (e) {}
    try { window.HearthriseActivity.setConfirmedActivity(null); } catch (e) {} };
  const reload = (bag) => {
    window.fetch = realFetch; D.__resetForTest(); A.clearFall(); A.__resetAwayReceipt(); A.__resetServerHp();
    R.resetRecord(); quiet();
    Object.assign(G, { inventory: Object.assign({}, bag), combatLog: [], combatKillsThisFoe: 0,
      lastOfflineSummary: null, playerHp: 20, playerMaxHp: 20 });
    delete G.consecFalls;
  };
  const door2 = (st, inv) => A.applyEnvelope(G, { ok: true, accrued: true, version: ++ver, now: iso(Date.now()),
    state: st, skills: {}, inventory: inv || {}, away: receipt() });
  const door1 = async (st, inv) => {
    window.fetch = function (u) {
      if (!/hr_load/.test(String(u))) return realFetch.apply(this, arguments);
      return Promise.resolve(new Response(JSON.stringify({ ok: true, version: ++ver, now: iso(Date.now()),
        state: st, skills: {}, inventory: inv || {} }), { status: 200 }));
    };
    R.configureRecord({ url: 'https://proj.supabase.co/', apiKey: 'anon-key', authToken: () => 'jwt-token', slot: 0 });
    const v = await R.requestRecord();
    assert(v.outcome === 'loaded', 'the boot read did not load: ' + JSON.stringify(v));
  };
  const sheet = () => {
    const el = document.getElementById('hr-death-scrim');
    if (!el || !el.classList.contains('show')) return null;
    const tx = (n) => (n ? n.textContent : null), tip = el.querySelector('.hr-death-tip');
    return { title: tx(el.querySelector('h2')), lead: tx(el.querySelector('.hr-death-lead')).replace(/\d/g, ''),
      rows: Array.from(el.querySelectorAll('.hr-death-row')).map((r) => ({ k: r.getAttribute('data-row'),
        t: tx(r.querySelector('.hr-death-t')), v: tx(r.querySelector('b')) || '' })),
      tipKey: tip ? tip.getAttribute('data-tip') : null, tip: tx(tip), note: tx(el.querySelector('[data-note]')),
      acts: Array.from(el.querySelectorAll('.hr-death-acts button')).map((b) => [b.textContent, b.disabled]) };
  };
  const row = (sh, k) => (sh && sh.rows.filter((r) => r.k === k)[0]) || null;
  const done = () => {
    window.fetch = realFetch; window.HearthriseAuto = realAuto; window.HearthriseGoalClaim = realGC;
    try { R.resetRecord(); R.configureRecord(null); } catch (e) {}
    try { D.__resetForTest(); A.clearFall(); A.__resetAwayReceipt(); A.setServerAccrualEnabled(wasOn); } catch (e) {}
    quiet();
    Object.assign(G, { combatLog: keep.log, combatKillsThisFoe: keep.kills, lastOfflineSummary: keep.off });
    if (keep.consec === undefined) delete G.consecFalls; else G.consecFalls = keep.consec;
    restoreG(snap);
    try { D.__resetForTest(); } catch (e) {}
  };
  A.setServerAccrualEnabled(true); autoOn(true); reload({});
  return { A, D, R, G, RUNG, AT, UNTIL, iso, receipt, state, autoOn, reload, door1, door2, sheet, row, done };
};

export default [

  /* ══════════════════════════════════════════════════════════════════════════
     AUTOEAT-SYNC — THE PLAYER'S FOOD PICK REACHES THE SERVER.   (b499)

     THE DEFECT. `hr_set_auto_eat` is the ONLY writer of
     player_state.auto_eat_enabled / auto_eat_food / auto_eat_pct, and it had
     ZERO client call sites. `auto_eat_food` was therefore NULL for every
     character, so the accrual engine's `chooseFood(null, …)` fell back to
     `bestHealingFood` — the BIGGEST healer in the bag — while the client
     honoured the player's nomination. The unit COUNTS converge (the
     pending-consume hold drains on the server's own movement), so nothing is
     lost or duplicated; the two sides just drain DIFFERENT STACKS, and the
     server takes the more valuable one. The toggle and threshold were unsynced
     for the same reason, so a player who switched auto-eat OFF was still eaten
     for overnight.

     WHY EVERY ASSERTION BELOW IS ABOUT COUNTING CALLS: the verb bumps the state
     version and writes a player_ledger row PER CALL, rate-gated 30/hour with a
     rejected call still consuming budget. A sync that fires per slider step is
     not a smaller version of the fix, it is a different bug.

     MUTATION (all proved): replace the debounce with an immediate flush → -1
     stops carrying the final value and -2 starts spending on a no-op; drop the
     `have.pct !== pc` dedupe → -2 goes red; drop the collect_first re-queue →
     -3 goes red.
     ══════════════════════════════════════════════════════════════════════════ */




  () => tryRun('RECEIPT-DEATHCAUSE-1: a server death receipt carries the foe AND the auto-eat state that span ran with', () => {
    const A = window.HearthriseAccrual;
    if (!A || typeof A.summaryFromAway !== 'function' || typeof A.receiptDeathCause !== 'function') return;

    /* The PRODUCER's shape — supabase/functions/hr-accrue/index.ts, the `away`
       literal — not an invented one. A fixture that drifts from the producer
       proves nothing about the producer (TESTING.md, the fixture rule). */
    const away = (over) => Object.assign({
      grantMs: 43200000, capped: false, awayMs: 43200000, paidMs: 42000,
      unpaidMs: 0, windowFrom: 1770000000000, windowTo: 1770043200000,
      tickMs: 2400, perkChannel: 'live', kills: 0, crits: 0,
      died: true, diedTo: 'dragon', autoEat: { enabled: false, pct: 25 },
      foodEaten: 0, blessed: false, buffsPaused: false, featuredMs: 0,
      featuredDropMult: 1, gold: 0, xp: {}, items: {}, levelUps: [], events: [],
    }, over || {});

    /* ── 1. THE DEATH SURVIVES THE TRANSLATION, WITH ZERO KILLS ──────────── */
    const rec = A.summaryFromAway(away(), { version: 7 });
    assert(rec.died === true,
      'a 0-kill death vanished from the receipt — `combat` is null with no kills, so this was the ONE '
      + 'absence the card could not describe: ' + JSON.stringify(rec.combat));
    assert(rec.diedTo === 'dragon', 'the receipt does not name the foe: ' + rec.diedTo);
    assert(rec.diedAfterMs === 42000,
      'the receipt lost how far into the night the run got (server states it as paidMs): ' + rec.diedAfterMs);
    assert(A.receiptDied(rec) === true, 'receiptDied() cannot see a 0-kill death');
    assert(A.classifyReceipt(rec) === 'away',
      'a death was classified as a quiet live sync — "you fell" is the one piece of news that is not '
      + 'measured in items: ' + A.classifyReceipt(rec));

    /* ── 2. THE CAUSE, BY BRANCH. The KEY is the rule; the copy may be
           reworded by Art without turning this red. ─────────────────────── */
    assert(A.receiptDeathCause(rec).key === 'auto-eat-off',
      'a death with auto-eat switched off did not name the cause: ' + JSON.stringify(A.receiptDeathCause(rec)));
    assert(/nothing healed you/i.test(A.receiptDeathCause(rec).clause),
      'the clause does not say what happened: ' + A.receiptDeathCause(rec).clause);

    const zero = A.summaryFromAway(away({ autoEat: { enabled: true, pct: 0 } }), {});
    assert(A.receiptDeathCause(zero).key === 'threshold-zero',
      'a death at a 0% trigger point was not named — the dial reproduces the same no-heal night as the '
      + 'switch and the ruling covers both: ' + JSON.stringify(A.receiptDeathCause(zero)));

    /* ── 3. AND IT CLAIMS NOTHING IT WAS NOT TOLD ────────────────────────── */
    const running = A.summaryFromAway(away({ autoEat: { enabled: true, pct: 25 } }), {});
    assert(A.receiptDeathCause(running) === null,
      'a death WITH auto-eat running was blamed on auto-eat — that is a gear problem and the death '
      + 'sheet already has copy for it');
    const older = A.summaryFromAway(away({ autoEat: undefined }), {});
    assert(older.autoEat === null && A.receiptDeathCause(older) === null,
      'a receipt from a server that does not state the auto-eat state produced a sentence anyway — '
      + 'the field is self-configuring and its absence must claim nothing');
    const lived = A.summaryFromAway(away({ died: false, diedTo: null }), {});
    assert(A.receiptDeathCause(lived) === null, 'a night nobody died in was given a death cause');
    assert(lived.diedTo === null && lived.diedAfterMs === 0,
      'a receipt with no death carried a foe or a death span: ' + JSON.stringify(lived));

    /* ── 3b · A DEATH MUST NOT WEAR AN ABSENCE'S WORDS (the b361 defect,
           re-opened by this very fix and closed with it) ──────────────────
       Making a 0-kill death visible on the receipt also made it reachable by
       `classifyReceipt`, which sends every death down the 'away' branch by
       design (b343: "a death is never a quiet toast"). The generic away
       sentence would then have announced "⏰ Away 0h — the server credited +0
       items, +0 XP, +0 gold" at a player who is sitting at the keyboard
       watching a 90-second settle. That is the exact sentence b361 deleted. */
    const attended = A.summaryFromAway(away({ grantMs: 90000, awayMs: 90000, paidMs: 42000 }), {});
    const line = A.receiptSentence(attended, { foeLabel: (id) => (id === 'dragon' ? 'Dragon' : null) });
    assert(line && !/Away 0h/i.test(line) && !/\+0 items/.test(line),
      'a death inside an attended 90-second settle announced itself as an absence with three zeroes '
      + '— the b361 sentence, back through the death branch: ' + line);
    assert(/You died to Dragon/.test(line),
      'the death toast does not name the foe the receipt states (the caller injects the label the '
      + 'same way it injects spanLabel): ' + line);
    assert(/nothing healed you/i.test(line),
      'the death toast dropped the cause the receipt carries: ' + line);
    assert(A.receiptNotice(attended).announce === true,
      'a death was demoted to a silent sync — "you fell" is the one piece of news that is not '
      + 'measured in items');

    /* ── 4. STATED, NOT INFERRED — the condition the ruling underlines.
           The LIVE toggle is the opposite of the receipt's in both directions;
           the sentence must follow the receipt every time. ───────────────── */
    const Auto = window.HearthriseAuto;
    if (Auto && typeof Auto.getEat === 'function') {
      const before = Auto.getEat();
      let parked = false;
      try {
        parked = (typeof Auto._parkEatSync === 'function') ? Auto._parkEatSync(true) : false;
        Auto.setEat({ enabled: true, threshold: 0.5 });     // switched back ON since the death
        assert(A.receiptDeathCause(rec).key === 'auto-eat-off',
          'the cause was rebuilt from the CURRENT toggle: a player who comes back to a corpse and '
          + 'switches auto-eat on before opening the modal would be told their death happened with it '
          + 'running. That is a different instant (b341: stated, not inferred).');
        Auto.setEat({ enabled: false });                    // switched OFF since a survivable night
        assert(A.receiptDeathCause(running) === null,
          'the live toggle invented a cause for a death the receipt says auto-eat was running through');
      } finally {
        Auto.setEat(before);
        if (typeof Auto._resetEatSync === 'function') Auto._resetEatSync();
        if (typeof Auto._parkEatSync === 'function') Auto._parkEatSync(parked);
      }
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     RECOVER — THE RECOVERY RULE ON THE CLIENT (First-Night Idle Rescue).

     Design ruling, Principal Game Designer, 2026-09-05: a death INTERRUPTS a
     run, it does not TERMINATE it. The character is Knocked Out for a flat
     RECOVERY_MS (0 for the first death they ever suffer), then gets up at full
     HP and resumes the same activity.

     The ENGINE half is guarded standalone in tests/accrual-engine.mjs
     (RECOVER-1..5, both mutation-proven). These are the surfaces: what the
     receipt carries, which sentence names the cause, and what the death sheet
     says to a player who is still face-down when they open it.
     ══════════════════════════════════════════════════════════════════════════ */
  () => tryRun('RECOVER-6: receiptDeathCause resolves all four states in priority order', () => {
    const A = window.HearthriseAccrual;
    if (!A || typeof A.receiptDeathCause !== 'function') return;

    /* FOUR STATES, ONE FUNCTION, AND THE ORDER IS THE RULE:
         auto-eat-off  -> threshold-zero  -> no-food  -> null
       `no-food` is LAST deliberately. The switch and the dial are things the
       player DID; a player who turned auto-eat off does not need to be sent
       cooking, they need to be told about the switch. An empty bag is only the
       most useful answer once neither of those is true — which is exactly the
       state every brand-new character is in, and the reason the branch exists.

       Asserted on the KEY, never the copy: the sentences are Art's to reword.

       MUTATION PROVEN (each independently, each after a green control):
         (i)   move the `no-food` branch ABOVE the `auto-eat-off` branch in
               src/net/accrue.js  -> (a) goes red
         (ii)  change `ae.hadFood === false` to `!ae.hadFood`
               -> (d) goes red (an older server's `undefined` starts claiming
                  starvation at every player it never measured)
         (iii) drop `hadFood` from summaryFromAway's autoEat translation
               -> (c) goes red */
    const rec = (autoEat) => ({ died: true, diedTo: 'slime', autoEat: autoEat });

    /* (a) THE SWITCH WINS over everything, including an empty bag. */
    assert(A.receiptDeathCause(rec({ enabled: false, pct: 25, hadFood: false })).key === 'auto-eat-off',
      'a death with auto-eat OFF and an empty bag blamed the bag. The switch is the thing the player '
      + 'did and the thing one tap fixes; sending them cooking instead is advice for a different '
      + 'problem: ' + JSON.stringify(A.receiptDeathCause(rec({ enabled: false, pct: 25, hadFood: false }))));

    /* (b) THE DIAL WINS over an empty bag, for the same reason. */
    assert(A.receiptDeathCause(rec({ enabled: true, pct: 0, hadFood: false })).key === 'threshold-zero',
      'a death at a 0% trigger point with an empty bag blamed the bag — the dial reproduces the '
      + 'no-heal night exactly and is the nearer cause');

    /* (c) AND WITH BOTH CONTROLS SANE, THE BAG IS THE ANSWER. */
    const hungry = A.receiptDeathCause(rec({ enabled: true, pct: 25, hadFood: false }));
    assert(hungry && hungry.key === 'no-food',
      'a death with auto-eat ON, a sane trigger and an EMPTY BAG named no cause at all. That is the '
      + 'state every new character is in and the whole population the Recovery ruling exists for: '
      + JSON.stringify(hungry));
    assert(/no cooked food/i.test(hungry.clause) && /no cooked food/i.test(hungry.sentence),
      'the no-food copy does not say what was missing: ' + JSON.stringify(hungry));

    /* (d) AND IT CLAIMS NOTHING IT WAS NOT TOLD. `undefined` is what a server
           deployment older than this build sends, and it must read as "not
           measured", never as "the bag was empty". */
    assert(A.receiptDeathCause(rec({ enabled: true, pct: 25 })) === null,
      'a receipt that never stated hadFood was told its bag was empty — the field is '
      + 'self-configuring and its ABSENCE must claim nothing');
    assert(A.receiptDeathCause(rec({ enabled: true, pct: 25, hadFood: true })) === null,
      'a death with auto-eat running and food in the bag was blamed on food. That is a gear problem '
      + 'and the death sheet already has copy for it.');
    assert(A.receiptDeathCause({ died: false, autoEat: { enabled: true, pct: 25, hadFood: false } }) === null,
      'a night nobody died in was given a death cause');
  }),

  () => tryRun('RECOVER-7: the away receipt carries the recovery payload, stated by the engine', () => {
    const A = window.HearthriseAccrual;
    if (!A || typeof A.summaryFromAway !== 'function') return;

    /* THE PRODUCER'S SHAPE — supabase/functions/hr-accrue/index.ts's `away`
       literal, fed from accrual.js's summary. A fixture that drifts from the
       producer proves nothing about the producer (TESTING.md, the fixture rule).
       rev. 2: the ladder is ESCALATING, so the payload carries the rungs as they
       were actually charged. Six falls on one day = free, 2m, 4m, 8m, 16m, 32m
       = 3,720,000 ms knocked out. */
    const LADDER = [0, 120000, 240000, 480000, 960000, 1920000];
    const REC = LADDER.reduce((a, b) => a + b, 0);   // 3,720,000
    const away = (over) => Object.assign({
      grantMs: 43200000, awayMs: 43200000, paidMs: 43200000 - REC, unpaidMs: 0,
      capped: false, kills: 542, crits: 0, died: true, diedTo: 'slime',
      deaths: LADDER.length, recoverMs: REC, recoverRemainingMs: 0, recoverLadder: LADDER,
      autoEat: { enabled: false, pct: 0, hadFood: false },
      gold: 0, xp: {}, items: {}, levelUps: [], events: [],
    }, over || {});

    const r = A.summaryFromAway(away(), { version: 3 });
    /* THE LADDER SURVIVES THE RECEIPT SHAPE. A card that regenerated the
       doubling from a death count would be wrong — and HARSHER than the truth —
       on every night that met the novice clamp or the 64-minute cap. */
    assert(Array.isArray(r.recoverLadder) && r.recoverLadder.join(',') === LADDER.join(','),
      'the receipt dropped or mangled the ladder, so "tonight it went free, 2m, 4m" would have to '
      + 'be regenerated by a renderer: ' + JSON.stringify(r.recoverLadder));
    assert(r.deaths === LADDER.length && r.recoverMs === REC && r.recoverRemainingMs === 0,
      'the receipt dropped the recovery payload. A renderer cannot infer it — dividing the lost time '
      + 'by two minutes is wrong on every night that closed mid-recovery, which is most of them: '
      + JSON.stringify({ deaths: r.deaths, recoverMs: r.recoverMs, left: r.recoverRemainingMs }));
    assert(r.autoEat && r.autoEat.hadFood === false,
      'the receipt dropped hadFood, so the one sentence that names the fix cannot be written: '
      + JSON.stringify(r.autoEat));
    /* CONSERVATION, on the surface the player actually reads: the night paid
       LESS time than it was credited, and the difference is the knockouts.
       Recovery consumes the credited window — no time is given back. */
    assert(r.awayMs - r.diedAfterMs === r.recoverMs,
      'the receipt does not account for the whole window: credited ' + r.awayMs + ', earned '
      + r.diedAfterMs + ', recovered ' + r.recoverMs + '. Every millisecond is either earning or '
      + 'knocked out and none may go missing.');

    /* A SERVER THAT PREDATES RECOVERY STATES NOTHING, and the receipt must then
       read as "no recovery happened" rather than as garbage. */
    const older = A.summaryFromAway(away({ deaths: undefined, recoverMs: undefined,
      recoverRemainingMs: undefined, recoverLadder: undefined }), {});
    assert(older.deaths === 0 && older.recoverMs === 0 && older.recoverRemainingMs === 0
      && Array.isArray(older.recoverLadder) && older.recoverLadder.length === 0,
      'an older server envelope produced a non-zero recovery payload: ' + JSON.stringify(older));

    /* AND THE READ-ONLY SEAM. The client may render the recovery line; it may
       never author one. `recoveringUntilMs` is a FUNCTION so a caller cannot
       capture a stale value, and there is deliberately no setter — the only
       writer is `applyEnvelopeState`, off the server's own state row. */
    assert(typeof A.recoveringUntilMs === 'function' && typeof A.isRecovering === 'function',
      'the recovery line has no read seam — every surface would go and invent its own countdown');
    assert(typeof A.setRecoveringUntil === 'undefined',
      'a client-side setter for recovering_until exists. The recovery line is server-owned: a client '
      + 'that can write it can cure its own knockout, which is the whole cost side of the rule.');
  }),

  () => tryRun('RECOVER-8: the death sheet says KNOCKED OUT with a countdown, and names the empty bag', () => {
    const D = window.HearthriseDeathSheet;
    if (!D || typeof D.describeDeath !== 'function') return;

    const base = {
      monsterName: 'Slime', killsThisFoe: 3, foodQty: 0, foodName: 'provision',
      ateThisFight: 0, autoEatOwned: true, autoEatOn: true, maxHp: 10,
      streakBroken: false, deaths: 4, nowMs: 1000000,
      /* rev. 2: the ladder's own numbers, stated by the simulation. This is the
         THIRD fall of the day, so it cost 4m and the next would cost 8m. */
      deathsToday: 3, recoveryMs: 240000, nextRecoveryMs: 480000,
      resumeHp: 4, missingHp: 6,
    };

    /* ── STILL DOWN: the headline is the CHARACTER'S STATE, not the event ──
       "The Slime got you" describes something that already finished. A player
       who is face-down for another 1:47 needs to be told THAT first, because it
       is the only fact that governs their next tap — the combat-start intent
       will refuse it (`recovering`). */
    const down = D.describeDeath(Object.assign({}, base, { recoveringUntilMs: 1000000 + 107000 }));
    assert(down.title === 'Knocked out',
      'the sheet headlined a knocked-out character with the kill instead of their state: ' + down.title);
    assert(down.lead === 'Back on your feet in 1:47.',
      'the sub-line does not count down to the second. "2m" would read as frozen for two minutes and '
      + 'then jump to nothing: ' + down.lead);
    assert(down.recoverMsLeft === 107000,
      'the model does not state the remaining time, so the renderer would have to re-derive it and '
      + 'the two would round differently: ' + down.recoverMsLeft);

    /* ── UP AGAIN: byte-for-byte the sheet that shipped ──────────────────── */
    const up = D.describeDeath(Object.assign({}, base, { recoveringUntilMs: 0 }));
    assert(up.title === 'The Slime got you' && up.recoverMsLeft === 0,
      'a character who is UP was told they were knocked out: ' + up.title);
    /* THE FIRST-DEATH GRACE reaches this surface as an ABSENCE: recovery is 0,
       so there is no countdown on the sheet a new player sees first. */
    const first = D.describeDeath(Object.assign({}, base, {
      deaths: 1, deathsToday: 1, recoveryMs: 0, nextRecoveryMs: 120000, recoveringUntilMs: 0 }));
    assert(first.recoverMsLeft === 0 && /first fall today/i.test(first.lead),
      "the day's first death showed a recovery countdown, or did not say it was free. It recovers in "
      + 'zero — that is the grace, and it is the first thing a new player must not be punished by: '
      + first.lead);

    /* ── THE LADDER, ON THE SHEET (rev. 2) ────────────────────────────────
       Three rows the flat rule did not need, and each of them answers a
       question the player would otherwise have to guess at: what did THIS fall
       cost, does the run continue, and what does the NEXT one cost. */
    const rowsOf = (m) => m.rows.reduce((o, r) => { o[r.k] = r; return o; }, {});
    const freeRows = rowsOf(first);
    assert(freeRows['run-stopped']
      && freeRows['run-stopped'].t === 'First fall of the day — you are back on your feet at once',
      "the day's free fall does not say so — a player who is charged nothing must be told, or the "
      + 'ladder reads as arbitrary when it starts charging: '
      + JSON.stringify(freeRows['run-stopped'] && freeRows['run-stopped'].t));
    assert(!freeRows.escalating,
      'the escalation warning fired on a FREE fall. It is shown from the second, where the doubling '
      + 'actually starts costing — announcing it on a free one is a lecture.');

    const third = rowsOf(D.describeDeath(Object.assign({}, base, { recoveringUntilMs: 0 })));
    assert(third['run-stopped']
      && third['run-stopped'].t === 'Knocked out for 4m — nothing earns while you recover',
      'the third fall of the day does not state what it cost: '
      + JSON.stringify(third['run-stopped'] && third['run-stopped'].t));
    assert(third.escalating
      && third.escalating.t === 'Recovery doubles each time you fall today — 8m if you fall again',
      'the sheet does not warn what the NEXT fall costs, so the doubling is discovered by being '
      + 'charged for it: ' + JSON.stringify(third.escalating && third.escalating.t));
    assert(third.resume && /picks up against the Slime/.test(third.resume.t),
      'the sheet does not say the run resumes. That is the single most important thing it can tell '
      + 'somebody who used to lose their whole night at the first death: '
      + JSON.stringify(third.resume && third.resume.t));
    /* ⚠ NOT "fully restored" ANY MORE. A full heal made dying the cheapest heal
       in the game; the character stands up on 40%, and this row is where they
       learn it before walking into the next fight on it. */
    assert(third.healed && third.healed.t === 'You got back up at 40% health'
      && third.healed.v === '4 / 10',
      'the sheet still promises a full heal on death: ' + JSON.stringify(third.healed));

    /* ── REST AT THE HEARTH — offered ONLY when the server would accept it ─
       `hr_rest` refuses a character who is up (`not_recovering`) and one at full
       health (`not_hurt`); an action that always fails is worse than none. */
    const downActs = (m) => m.actions.map((a) => a.k);
    assert(downActs(down).indexOf('rest') === 0,
      'a knocked-out character was not offered Rest at the Hearth as the PRIMARY action: '
      + JSON.stringify(downActs(down)));
    /* AMENDED b511 (phantom-food / silent-refusal P0). `base` carries
       foodQty:0, and a foodless character CANNOT rest — `hr_rest` refuses
       `insufficient_food`. Offering "eat 6 health" to an empty bag was measured
       live as the primary tap on a sheet the player was stuck behind, and the
       refusal was silent. So the PRICE is asserted where it is honest (a bag
       with food) and the DISABLED wording where it is not. */
    const downFed = D.describeDeath(Object.assign({}, base, {
      recoveringUntilMs: 1000000 + 107000, foodQty: 4, restFood: 4, foodName: 'Cooked Shrimp' }));
    assert(downFed.actions[0].label === 'Rest at the Hearth — eat 6 health' && !downFed.actions[0].disabled,
      'the Rest action does not price itself in health, so the player cannot tell whether their bag '
      + 'covers it: ' + downFed.actions[0].label);
    assert(down.actions[0].k === 'rest' && down.actions[0].disabled === true
      && down.actions[0].label === 'No food to rest with',
      'an EMPTY bag was still offered a priced Rest the server refuses insufficient_food: '
      + JSON.stringify(down.actions[0]));
    assert(downActs(up).indexOf('rest') < 0,
      'a character who is UP was offered Rest at the Hearth — the server refuses it not_recovering');
    const full = D.describeDeath(Object.assign({}, base, {
      recoveringUntilMs: 1000000 + 107000, missingHp: 0 }));
    assert(downActs(full).indexOf('rest') < 0,
      'a character at FULL health was offered Rest at the Hearth — the server refuses it not_hurt, '
      + 'and a rest that heals nothing would be a free cure');

    /* ── THE EMPTY BAG, SAID PLAINLY ─────────────────────────────────────── */
    const rows = (m) => m.rows.map((r) => r.k);
    const empty = D.describeDeath(Object.assign({}, base, { recoveringUntilMs: 0, hadFood: false }));
    const nf = empty.rows.filter((r) => r.k === 'no-food')[0];
    assert(nf && nf.t === 'Cook some food — your bag is empty.',
      'the sheet does not name the empty bag. It is the state every new character is in and the one '
      + 'thing that would have changed the night: ' + JSON.stringify(rows(empty)));
    /* ⚠ `=== false`, not truthiness: `undefined` means nobody measured it, and a
       truthiness test would tell every such player their bag was empty. */
    const unknown = D.describeDeath(Object.assign({}, base, { recoveringUntilMs: 0 }));
    assert(rows(unknown).indexOf('no-food') < 0,
      'a sheet that was never told about the bag claimed it was empty anyway');
    const fed = D.describeDeath(Object.assign({}, base, { recoveringUntilMs: 0, hadFood: true }));
    assert(rows(fed).indexOf('no-food') < 0, 'a character WITH food was told their bag was empty');

    /* ── AND AN OWNER IS NEVER SOLD AUTO-EAT (ruling 2b condition 3, kept) ── */
    const owner = D.describeDeath(Object.assign({}, base, {
      recoveringUntilMs: 0, foodQty: 8, foodName: 'Cooked Shrimp', autoEatOwned: true,
      autoEatOn: false, autoEatCost: 100,
    }));
    assert(owner.shopLink === false,
      'the sheet offered to sell Auto-Eat to a player who already owns it');
    assert(!/Bounty Shop/.test(owner.tip),
      'the tip pitched the Bounty Shop at an owner — condition 3 of the 2b ruling forbids quoting a '
      + 'price to someone holding the thing: ' + owner.tip);
    assert(owner.enableAutoEat === true,
      'an owner with the switch OFF was not given the one tap that fixes the thing that killed them');

    /* ── THE REPEAT FALLER WITH THE SWITCH OFF (rev. 2) ───────────────────
       By the third fall of a day the cost of leaving Auto-Eat off is no longer
       theoretical — it is the ladder — and this is the one population for whom
       one tap fixes it. */
    const repeat = D.describeDeath(Object.assign({}, base, {
      recoveringUntilMs: 0, deathsToday: 3, foodQty: 0, ateThisFight: 0,
      autoEatOwned: true, autoEatOn: false,
    }));
    assert(repeat.tipKey === 'auto-eat-off-repeat',
      'a player on their third fall of the day with Auto-Eat OWNED and OFF got the generic tip '
      + 'instead of the one that names what it is costing them: ' + repeat.tipKey);
    assert(/paying for it in recovery/.test(repeat.tip) && repeat.enableAutoEat === true,
      'the repeat-faller tip does not name the cost, or does not carry the one tap: ' + repeat.tip);
  }),

  () => tryRun('RECOVER-10: an ATTENDED death asks the server — no idle declaration, no free heal, '
    + 'and the timer is the envelope\'s', () => {
    /* ══ THE P0 THE LIVE PLAY-GATE FOUND (b509, 2026-09-06) ══════════════
       QA account, slot 2, Auto-Eat switched OFF through the real seam, Dark
       Wizard, 12 max HP. The client showed "Knocked out. Back on your feet in
       1:38 … you got back up at 40% health 5/12" and was at 12/12 a second
       later. The SERVER, read straight out of the database at the same instant:
       `recovering_until` NULL, hp 12/12, no `deaths` row, no ledger row, and
       `active_kind = idle` from the moment of the death.

       ONE line did all of it. The attended death called `stopCombat()`, which
       DECLARES `idle`; hr_apply stamps `accrued_to = now()` on any activity
       delta, so the 19-second window the death happened in was closed without
       ever being simulated. Nothing asked the server, so the client answered —
       out of `G.stats.deaths`, a LIFETIME tally that nothing seeds
       `deathsTodayBefore` from, which is how a first fall came to quote a
       fifth-fall rung.

       This test drives the real death through the real engine and the real
       COMBAT_FX, and asserts the five properties that were all false live. */
    const G = window.G;
    const A = window.HearthriseAccrual;
    const C = window.HearthriseCore;
    const D = window.HearthriseDeathSheet;
    const AU = window.HearthriseAuto;
    if (!A || typeof A.noteFall !== 'function' || !C || !C.combatSim || !D
        || typeof window.hrCombatDown !== 'function') { skip('the fall seam is not wired'); return; }

    const snap = snapshotG();
    const wasOn = A.isServerAccrualEnabled();
    const realDeclare = window.declareActivity;
    const realNote = A.noteSettleEvent;
    const eatWas = (AU && typeof AU.getEat === 'function') ? AU.getEat() : null;
    const declares = [];
    const events = [];
    try {
      A.setServerAccrualEnabled(true);
      window.declareActivity = function (kind, id) { declares.push({ kind, id }); return null; };
      A.noteSettleEvent = function (kind) { events.push(kind); return null; };
      A.clearFall();

      const mid = window.MONSTERS.slime ? 'slime' : Object.keys(window.MONSTERS)[0];
      const mon = window.MONSTERS[mid];

      /* THE CONTROL. A zero below proves nothing unless this same spy has seen
         a real declaration go out — the b341/ACT-6 rule. */
      G.activeMonster = mid;
      window.stopCombat();
      assert(declares.length === 1 && declares[0].kind === 'idle',
        'the declaration spy never saw a live stop declare `idle`, so the zero asserted below would '
        + 'prove nothing: ' + JSON.stringify(declares));

      /* AUTO-EAT OFF, THROUGH THE REAL SEAM — the state the live gate ran in
         and the state 34 of 36 production characters are in. */
      if (AU && typeof AU.setEat === 'function') AU.setEat({ enabled: false });

      declares.length = 0; events.length = 0;
      A.clearFall();
      G.playerMaxHp = 12; G.playerHp = 1;
      G.activeMonster = mid; G.monsterHp = mon.hp; G.monsterMaxHp = mon.hp;
      G.combatLog = [];
      G.stats = Object.assign({}, G.stats, { deaths: 4 });   // the lifetime tally that used to leak into the ladder

      /* THE DEATH, through the engine and the REAL effect sink. */
      const info = C.combatSim.resolveDeath(G, window.HearthriseCombatSim.ctx());
      assert(info && info.died === true, 'the fixture did not produce a death');

      /* ① NO IDLE DECLARATION. The whole bug in one assertion. */
      assert(declares.length === 0,
        'an attended death declared ' + JSON.stringify(declares) + '. Any activity delta stamps '
        + '`accrued_to = now()` server-side, so this CLOSES the window the death is in before the '
        + 'engine can price it — no recovery line, no deaths row, no ledger row, and the old free '
        + 'full heal. That is exactly what the live play-gate measured.');

      /* ② THE POINTER SURVIVES and the fall is a QUESTION. */
      assert(G.activeMonster === mid,
        'the death cleared the activity pointer, so the run the server is about to carry on with no '
        + 'longer exists on this client: ' + G.activeMonster);
      assert(events.length === 1 && events[0] === 'death',
        'the death did not schedule exactly one settle. The server floor is 60 s, so the event '
        + 'trigger is the only thing standing between the player and a 90-second wait for their own '
        + 'recovery time: ' + JSON.stringify(events));
      assert(A.fallState().phase === 'pending' && A.isKnockedOut() === true,
        'the fall is not PENDING an answer: ' + A.fallState().phase);

      /* ③ NO LOCAL FULL HEAL. 40% of 12 is 4, and it must not drift up. */
      const resume = C.away.resumeHpFor(12);
      assert(G.playerHp === resume,
        'the client healed itself off a death to ' + G.playerHp + '/12 instead of the ' + resume
        + ' the resume rule stands them on. A full heal makes dying the cheapest heal in the game.');

      /* ④ THE TICK DOES NOT SWING WHILE THE ANSWER IS IN FLIGHT. */
      const logBefore = G.combatLog.length;
      window.combatTick();
      assert(G.playerHp === resume && G.monsterHp === 0 && G.combatLog.length === logBefore,
        'the combat loop kept swinging through a fall the server has not priced yet — the client '
        + 'predicting past its own death, which is what makes the settle and the screen disagree.');

      /* ⑤ THE ANSWER LANDS, AND THE SHEET IS THE ENVELOPE. Nothing below is
         computed by the client: the instant, the counters and the death itself
         are all read off `state`. */
      const until = Date.now() + 118000;
      A.applyEnvelopeState(G, {
        state: {
          accrued_to: new Date(Date.now() + 500).toISOString(),
          recovering_until: new Date(until).toISOString(),
          deaths_today: 2, deaths_lifetime: 7,
        },
        away: { died: true, deaths: 1 },
      });
      const st = A.fallState();
      assert(st.phase === 'recovering' && st.until === until,
        'the envelope\'s recovery line did not become the client\'s: ' + JSON.stringify(st));
      const moment = D._readMoment(info);
      assert(moment.recoveringUntilMs === until,
        'the death sheet\'s timer is not the envelope\'s `recovering_until`. A timer this client '
        + 'cannot source from the server is the 1:38 the play-gate photographed: '
        + moment.recoveringUntilMs + ' vs ' + until);
      assert(moment.deathsToday === 2,
        'the sheet read the ladder off the client\'s LIFETIME death tally again instead of the '
        + 'server\'s `deaths_today`: ' + moment.deathsToday);
      const model = D.describeDeath(moment);
      assert(model.fallPhase === 'recovering' && model.title === 'Knocked out'
        && model.recoverMsLeft > 110000 && model.recoverMsLeft <= 118000,
        'the sheet does not render the server\'s knockout: ' + JSON.stringify(
          { phase: model.fallPhase, title: model.title, left: model.recoverMsLeft }));

      /* ⑥ AND THE HONEST OTHER ANSWER. A window the server priced with NO
         death in it (a client/server dice divergence) must be SAID, never
         dressed up as a knockout with an invented timer. */
      A.clearFall();
      A.noteFall(Date.now());
      A.applyEnvelopeState(G, {
        state: { accrued_to: new Date(Date.now() + 500).toISOString(), recovering_until: null },
        away: { died: false, deaths: 0 },
      });
      const div = D.describeDeath(D._readMoment(info));
      /* The wording moved in b512: an unconfirmed fall now quotes the SERVER's
         resume health when it has one ("still standing — resuming at N HP")
         and keeps the older "no fall" sentence when it does not. Both are the
         same property this line has always asserted — the sheet SAYS the run
         continued — so the assertion names the property, not one phrasing. */
      assert(div.fallPhase === 'unconfirmed' && /no fall|still standing/i.test(div.lead),
        'a fall the server did not see was still rendered as a knockout: '
        + JSON.stringify({ phase: div.fallPhase, lead: div.lead }));

      /* ⑦ THE RESUME IS THE ABSENCE OF A CHANGE. Once nobody is down, the
         gate opens and the foe is standing again — the same transition
         `simulateSpan` makes away. */
      G.monsterHp = 0;
      assert(window.hrCombatDown() === false, 'the gate stayed shut after the fall resolved');
      assert(G.monsterHp === mon.hp,
        'the fight resumed against a foe still on 0 HP, which is a free kill for having died: '
        + G.monsterHp);
    } finally {
      try { D.__resetForTest(); } catch (e) {}
      window.declareActivity = realDeclare;
      A.noteSettleEvent = realNote;
      try { A.clearFall(); } catch (e) {}
      if (AU && typeof AU.setEat === 'function' && eatWas) AU.setEat({ enabled: !!eatWas.enabled });
      A.setServerAccrualEnabled(!!wasOn);
      try { window.stopCombat(); } catch (e) {}
      restoreG(snap);
      closeOverlays();   // an attended death raises #hr-death-scrim; this is the sheet's own close
    }
  }),

  () => tryRun('RECOVER-13: a below-floor answer is NOT an answer — the fall re-asks itself and can never freeze', () => {
    /* MEASURED LIVE, b511 (commit 180ed086), QA slot, 16:25 UTC 2026-09-06.
       The client fell 12 s into a `combat/dark_wizard` run. The forced settle
       that fired AT the fall was inside the 60 s server floor and answered
       `{ok:true, accrued:false, reason:'below_min_span'}` — no envelope, so
       `accruedToAt` never reached `fall.at`. NINETY-FOUR SECONDS LATER the
       state was byte-identical: phase `pending`, `answered:false`, the sheet
       reading "Asking the hearth how long you are down…", the swing gate shut
       and the bar still "Fighting Dark Wizard". Nothing re-asked.

       The class: the fall recorded a QUESTION and then delegated the ASKING to
       the generic settle cadence, which legitimately declines for reasons that
       have nothing to do with a fall (hidden tab, loop not started, a refusal
       re-stamping `lastSettleAt`). This drives the whole machine on a fake
       clock and asserts the three exits — death, no-death, and silence — plus
       the one that was live: an `accrued:false` reply must not end the wait. */
    const A = window.HearthriseAccrual, G = window.G;
    if (!A || typeof A.nextFallReaskAt !== 'function' || typeof A.setSettleEnv !== 'function') {
      skip('the fall re-ask seam is not wired'); return;
    }
    const snap = snapshotG();
    const wasOn = A.isServerAccrualEnabled();
    /* ANCHORED TO THE REAL CLOCK, not a fixed epoch. `fallState()` and the
       death sheet default to `Date.now()` when no instant is passed, so a
       fake clock parked in another month makes every pending fall read as
       TIMED OUT the moment the sheet looks at it — the fixture would then
       assert the ceiling while claiming to assert the wait. Starting a
       breath ahead of now keeps the two clocks in the same minute; the
       fixture only ever moves FORWARD, so the pending fall stays pending
       on the real clock too. */
    let t = Date.now() + 5000;
    const timers = new Map();
    let nextId = 1;
    const asks = [];
    const advance = function (ms) {
      const end = t + ms;
      for (;;) {
        let bestId = 0, bestAt = Infinity;
        timers.forEach(function (v, k) { if (v.at <= end && v.at < bestAt) { bestAt = v.at; bestId = k; } });
        if (!bestId) break;
        const due = timers.get(bestId);
        timers.delete(bestId);
        t = due.at;
        try { due.fn(); } catch (e) {}
      }
      t = end;
    };
    try {
      A.setServerAccrualEnabled(true);
      A.setSettleEnv({
        now: function () { return t; },
        setTimer: function (fn, ms) { const id = nextId++; timers.set(id, { fn: fn, at: t + Math.max(1, ms) }); return id; },
        clearTimer: function (h) { timers.delete(h); },
        /* HIDDEN ON PURPOSE — the backgrounded tab the cadence declines to
           serve is exactly the shape that froze live. */
        visible: function () { return false; },
        enabled: function () { return true; },
        configured: function () { return true; },
        pointer: function () { return { kind: 'combat', id: 'slime' }; },
        request: function (o) { asks.push({ at: t, reason: o && o.reason }); return null; },
      });

      /* ① THE FALL SCHEDULES ITS OWN RE-ASK, at the earliest LEGAL instant. */
      A.clearFall();
      const fellAt = t;
      A.noteFall(fellAt);
      assert(A.fallState(t).phase === 'pending' && A.isKnockedOut(t) === true,
        'the fall did not open PENDING: ' + A.fallState(t).phase);
      const due = A.fallReaskAt();
      assert(due >= fellAt + A.ACCRUE_MIN_SPAN_MS && due < fellAt + A.FALL_CONFIRM_TIMEOUT_MS,
        'the fall scheduled no legal re-ask. Without one, a `below_min_span` refusal is the last '
        + 'thing that ever happens and the player waits behind the sheet forever: due=' + due
        + ' fell=' + fellAt);
      assert(A.nextFallReaskAt(fellAt, 0, fellAt) === fellAt + A.ACCRUE_MIN_SPAN_MS + A.FALL_REASK_MARGIN_MS,
        'the re-ask arithmetic does not clear the SERVER floor, so the retry would only earn a '
        + 'second below_min_span: ' + A.nextFallReaskAt(fellAt, 0, fellAt));

      /* ② A PENDING FALL OUTRANKS `hidden`. The control proves the same state
            WITHOUT a pending fall still declines, so the true below proves
            something. */
      const hid = A.decideSettle({ enabled: true, configured: true, visible: false, kind: 'combat',
        lastSettleAt: fellAt - 200000, eventAt: 0 }, fellAt);
      assert(hid.settle === false && hid.reason === 'hidden',
        'the control failed: a hidden tab with no pending fall must still decline: ' + JSON.stringify(hid));
      const shown = A.decideSettle({ enabled: true, configured: true, visible: false, kind: 'combat',
        lastSettleAt: fellAt - 200000, eventAt: 0, fallPending: true }, fellAt);
      assert(shown.settle === true,
        'a backgrounded tab with a player face-down still refused to ask, which is a run that never '
        + 'resumes: ' + JSON.stringify(shown));

      /* ③ THE BELOW-FLOOR ANSWER IS NOT AN ANSWER. Nothing is applied (that is
            what `accrued:false` means — no envelope), and the wait must still
            end: one re-ask goes out once the floor has passed. */
      advance(A.ACCRUE_MIN_SPAN_MS + A.FALL_REASK_MARGIN_MS + 1000);
      assert(asks.length === 1 && asks[0].reason === 'fall-reask',
        'nothing re-asked after the server floor passed. This is the live freeze exactly: '
        + JSON.stringify(asks));
      assert(asks[0].at >= fellAt + A.ACCRUE_MIN_SPAN_MS,
        're-asked INSIDE the 60 s floor, which can only earn a second below_min_span and burn a '
        + 'rate spend: ' + (asks[0].at - fellAt) + 'ms after the fall');
      assert(A.fallState(t).phase === 'pending',
        'an unanswered re-ask resolved the fall on its own — the client answering its own question');

      /* ④ (i) A DEATH IN THE COVERING WINDOW ⇒ the SERVER clock, and the
             asking stops. */
      const until = t + 118000;
      A.applyEnvelopeState(G, {
        state: {
          accrued_to: new Date(t + 500).toISOString(),
          recovering_until: new Date(until).toISOString(),
          deaths_today: 2, deaths_lifetime: 7,
        },
        away: { died: true, deaths: 1 },
      });
      const rec = A.fallState(t);
      assert(rec.phase === 'recovering' && rec.until === until,
        'the covering answer did not become the recovery line: ' + JSON.stringify(rec));
      const asksAfter = asks.length;
      advance(400000);
      assert(asks.length === asksAfter && A.fallReaskAt() === 0,
        'the fall kept re-asking after it had been answered — an answered question asked again is a '
        + 'wasted invocation on every settle budget: ' + JSON.stringify(asks));

      /* ⑤ (ii) NO DEATH IN THE COVERING WINDOW ⇒ still standing. The sheet
             replaces its own line and the swing gate OPENS — the client must
             not stay face-down on a fall the server did not see. */
      A.clearFall();
      asks.length = 0;
      const fell2 = t;
      A.noteFall(fell2);
      advance(A.ACCRUE_MIN_SPAN_MS + A.FALL_REASK_MARGIN_MS + 1000);
      assert(asks.length === 1, 'the second fall did not re-ask: ' + JSON.stringify(asks));
      A.applyEnvelopeState(G, {
        state: { accrued_to: new Date(t + 500).toISOString(), recovering_until: null, hp: 9, max_hp: 13 },
        away: { died: false, deaths: 0 },
      });
      const up = A.fallState(t);
      assert(up.phase === 'unconfirmed' && up.answered === true && A.isKnockedOut(t) === false,
        'a priced window with no death in it left the player knocked out anyway: ' + JSON.stringify(up));
      const D = window.HearthriseDeathSheet;
      if (D && typeof D.describeDeath === 'function' && typeof D._readMoment === 'function') {
        const m = D.describeDeath(D._readMoment(null));
        assert(m.fallPhase === 'unconfirmed' && !/Asking the hearth/i.test(m.lead),
          'the sheet still says it is asking after the hearth answered: ' + m.lead);
        assert(/still standing|never stopped/i.test(m.lead),
          'the replacement line does not tell the player they are up: ' + m.lead);
      }

      /* ⑥ (iii) SILENCE ⇒ unconfirmed at the ceiling, never stuck pending, and
             a BOUNDED number of asks (a retry loop against the 30/min budget
             would be a different bug wearing this fix). */
      A.clearFall();
      asks.length = 0;
      const fell3 = t;
      A.noteFall(fell3);
      advance(A.FALL_CONFIRM_TIMEOUT_MS + 30000);
      const dead = A.fallState(t);
      assert(dead.phase === 'unconfirmed' && dead.timedOut === true && A.isKnockedOut(t) === false,
        'a silent server left the run frozen past the ceiling: ' + JSON.stringify(dead));
      assert(asks.length >= 1 && asks.length <= 3,
        'the unanswered fall asked ' + asks.length + ' times before giving up — the re-ask must be '
        + 'spaced by the server floor, not a loop');
      assert(A.fallReaskAt() === 0 && timers.size === 0,
        'a timer outlived the fall it belonged to: reaskAt=' + A.fallReaskAt() + ' timers=' + timers.size);

      /* ⑦ THE SHEET NAMES THE WAIT. An open-ended spinner is indistinguishable
            from a hung game, which is what the player actually saw. */
      A.clearFall();
      A.noteFall(t);
      if (D && typeof D.describeDeath === 'function' && typeof D._readMoment === 'function') {
        const pend = D.describeDeath(D._readMoment(null));
        assert(pend.fallPhase === 'pending' && /up to a minute/i.test(pend.lead),
          'the pending sheet does not state how long the wait can be: ' + pend.lead);
      }
    } finally {
      try { A.setSettleEnv(null); } catch (e) {}
      try { A.clearFall(); } catch (e) {}
      try { window.HearthriseDeathSheet.__resetForTest(); } catch (e) {}
      timers.clear();
      A.setServerAccrualEnabled(!!wasOn);
      restoreG(snap);
    }
  }),

  () => tryRun('RECOVER-11: a knockout survives a reload — the sheet raises once and the bar says so', () => {
    /* MEASURED LIVE, b510, 13:52 UTC. A character with `recovering_until` 27
       minutes ahead RELOADED the page and got a normal "Fighting Goblin"
       activity bar at 13/13 HP: no sheet, no countdown, no Rest button, nothing
       on screen saying that nothing would earn for the next 27 minutes. Calling
       HearthriseDeathSheet.show() by hand rendered the right sheet, so the data
       and the sheet were both fine — the only trigger was the fall MOMENT in
       the live tick, and a reload has no such moment.

       This drives the boot path the way a reload does: an envelope with a
       future `recovering_until` arrives at a client that never saw a fall. */
    const G = window.G;
    const A = window.HearthriseAccrual;
    const D = window.HearthriseDeathSheet;
    if (!A || typeof A.applyEnvelopeState !== 'function' || !D
        || typeof D.maybeRaiseRecovery !== 'function'
        || typeof window.refreshActivityBar !== 'function') { skip('the recovery seam is not wired'); return; }

    const snap = snapshotG();
    const wasOn = A.isServerAccrualEnabled();
    try {
      A.setServerAccrualEnabled(true);
      A.clearFall();
      D.__resetForTest();

      const mid = window.MONSTERS.slime ? 'slime' : Object.keys(window.MONSTERS)[0];
      const mon = window.MONSTERS[mid];
      G.activeMonster = mid; G.monsterHp = mon.hp; G.monsterMaxHp = mon.hp;
      G.playerMaxHp = 13; G.playerHp = 13;

      /* ① THE FIRST ENVELOPE AFTER BOOT RAISES THE SHEET. No fall was noted —
         that is exactly the reloaded client's state. */
      const until = Date.now() + 27 * 60000;
      A.applyEnvelopeState(G, {
        state: {
          accrued_to: new Date().toISOString(),
          recovering_until: new Date(until).toISOString(),
          deaths_today: 7, deaths_lifetime: 9,
        },
      });
      assert(A.fallState().phase === 'recovering',
        'the envelope did not put the client in recovery: ' + A.fallState().phase);
      const scrim = document.getElementById('hr-death-scrim');
      assert(scrim && scrim.classList.contains('show'),
        'a reload into a live knockout showed the player NOTHING. That is the b510 bug: 27 minutes '
        + 'in which nothing earns, with no sheet, no countdown and no Rest button.');
      assert(/Back on your feet in/.test(scrim.textContent || ''),
        'the raised sheet is not the recovery sheet: ' + (scrim.textContent || '').slice(0, 120));

      /* ② THE BAR TELLS THE TRUTH, and Stop still works. */
      window.refreshActivityBar();
      const nameEl = document.getElementById('ab-name');
      const stopBtn = document.getElementById('ab-stop');
      if (nameEl) {
        assert(/Knocked out/.test(nameEl.textContent) && /27m|26m/.test(nameEl.textContent),
          'the activity bar still claims the player is fighting while the server has them on the '
          + 'floor: ' + nameEl.textContent);
        assert(!stopBtn || stopBtn.style.display !== 'none',
          'Stop was hidden while knocked out — leaving is the one choice a downed player still has');
      }

      /* ③ A SECOND ENVELOPE FOR THE SAME WINDOW DOES NOT RE-RAISE. Settles are
         frequent; a raise per envelope would re-open a sheet the player just
         dismissed, every few seconds, for the whole knockout. */
      D.close();
      A.applyEnvelopeState(G, {
        state: { accrued_to: new Date().toISOString(), recovering_until: new Date(until).toISOString() },
      });
      const again = document.getElementById('hr-death-scrim');
      assert(!again || !again.classList.contains('show'),
        'the sheet re-raised itself for a recovery window the player had already dismissed');

      /* ④ UP AGAIN: the line clears and the bar goes back to the fight. */
      A.applyEnvelopeState(G, {
        state: { accrued_to: new Date().toISOString(), recovering_until: null },
      });
      assert(A.fallState().phase !== 'recovering', 'a null recovery line did not stand the player up');
      window.refreshActivityBar();
      if (nameEl) {
        assert(/Fighting/.test(nameEl.textContent),
          'the bar stayed knocked out after the server stood the player up: ' + nameEl.textContent);
      }
    } finally {
      try { D.__resetForTest(); } catch (e) {}
      try { A.clearFall(); } catch (e) {}
    }
  }),

  () => tryRun('RECOVER-14: the ENVELOPE repaints the sheet and the bar — a phase change is not '
    + 'something a throttled timer notices a minute later', () => {
    /* ══ MEASURED LIVE, b513, ~02:15 UTC 2026-09-07 ══════════════════════
       The character fell, the sheet opened on `pending`, and 75 s later the
       b512 re-ask WORKED: `fallState()` answered
       `{phase:'recovering', answered:true, serverDied:true, msLeft:1007205}`
       and `isKnockedOut()` was true. Two surfaces went on lying anyway:
         · the sheet lead still read "Asking the hearth how long you are down"
           instead of the countdown;
         · the activity bar still read "Fighting Dark Wizard · 0 this fight"
           instead of the b511 knocked-out line.
       Neither surface computes anything stale — both read `fallState()` at the
       instant they are asked. The defect was WHEN they were asked: the sheet's
       re-render lived only in its own 1 Hz `setInterval` and the bar's only
       unconditional driver is a 100 ms one, and Chrome throttles a background
       or occluded tab's timers to 1/s, then to 1/MINUTE after five minutes
       hidden. The fix hangs both repaints off `hearthrise:fall`, which
       applyEnvelopeState dispatches synchronously.

       SO THIS TEST NEVER WAITS AND NEVER CALLS refreshActivityBar() BY HAND —
       that hand-call is exactly why RECOVER-11 stayed green through this bug.
       Everything below is asserted in the same turn the envelope lands, which
       is the property a throttled timer cannot fake. */
    const G = window.G;
    const A = window.HearthriseAccrual;
    const D = window.HearthriseDeathSheet;
    if (!A || typeof A.applyEnvelopeState !== 'function' || typeof A.noteFall !== 'function'
        || !D || typeof D.show !== 'function'
        || typeof window.refreshActivityBar !== 'function') { skip('the recovery seam is not wired'); return; }

    const snap = snapshotG();
    const wasOn = A.isServerAccrualEnabled();
    try {
      A.setServerAccrualEnabled(true);
      A.clearFall();
      D.__resetForTest();
      A.applyEnvelopeState(G, { state: { recovering_until: null } });

      const mid = window.MONSTERS.slime ? 'slime' : Object.keys(window.MONSTERS)[0];
      const mon = window.MONSTERS[mid];
      G.activeMonster = mid; G.monsterHp = 0; G.monsterMaxHp = mon.hp;
      G.playerMaxHp = 13; G.playerHp = 5;

      /* ① THE FALL, and the last repaint anybody gets before the tab is
            throttled: the sheet on `pending`, the bar on the fight. */
      A.noteFall(Date.now());
      D.show(null, null);
      window.refreshActivityBar();
      const scrim = document.getElementById('hr-death-scrim');
      const nameEl = document.getElementById('ab-name');
      assert(scrim && scrim.classList.contains('show'), 'the death sheet did not open on the fall');
      const lead0 = scrim.querySelector('.hr-death-lead');
      assert(lead0 && /Asking the hearth/i.test(lead0.textContent),
        'the sheet did not open on the pending lead: ' + (lead0 && lead0.textContent));
      if (nameEl) {
        assert(/Fighting/.test(nameEl.textContent),
          'the bar did not start on the fight: ' + nameEl.textContent);
      }

      /* ② THE ANSWER LANDS. No timer tick, no manual repaint — just the
            envelope, exactly as the network delivers it. */
      const until = Date.now() + 1007205;
      A.applyEnvelopeState(G, {
        state: {
          accrued_to: new Date(Date.now() + 500).toISOString(),
          recovering_until: new Date(until).toISOString(),
          deaths_today: 15, deaths_lifetime: 22,
        },
        away: { died: true, deaths: 1 },
      });
      assert(A.fallState().phase === 'recovering',
        'the fixture did not reach the state the play-gate measured: ' + A.fallState().phase);

      const lead = document.querySelector('#hr-death-scrim .hr-death-lead');
      assert(lead && /Back on your feet in \d+:\d\d/.test(lead.textContent),
        'the sheet lead did not follow the phase onto the countdown when the envelope stated a '
        + 'recovery line — the b513 stall, in which the model was recovering and the screen still '
        + 'said "Asking the hearth": ' + (lead && lead.textContent));
      const h2 = document.querySelector('#hr-death-scrim .hr-death-top h2');
      assert(h2 && /Knocked out/.test(h2.textContent),
        'the sheet title did not follow the phase: ' + (h2 && h2.textContent));
      if (nameEl) {
        assert(/Knocked out/.test(nameEl.textContent),
          'the activity bar still claimed the player was fighting after the envelope knocked them '
          + 'out. The bar reads fallState() fresh — nothing repainted it: ' + nameEl.textContent);
      }

      /* ③ AND BACK UP, on the same one link. A surface that only learns the
            bad news on an event and the good news on a poll would leave the
            player reading "Knocked out" while they are fighting. */
      A.applyEnvelopeState(G, {
        state: { accrued_to: new Date().toISOString(), recovering_until: null },
      });
      assert(A.fallState().phase !== 'recovering', 'a null recovery line did not stand the player up');
      if (nameEl) {
        assert(/Fighting/.test(nameEl.textContent),
          'the bar stayed knocked out after the envelope stood the player up: ' + nameEl.textContent);
      }
    } finally {
      try { D.__resetForTest(); } catch (e) {}
      try { A.clearFall(); } catch (e) {}
      try { A.applyEnvelopeState(window.G, { state: { recovering_until: null } }); } catch (e) {}
      A.setServerAccrualEnabled(!!wasOn);
      restoreG(snap);
    }
  }),

  () => tryRun('RECOVER-22: on a short screen the KO sheet keeps its head and its actions on screen '
    + 'at scroll 0 — the attended fall AND the reload into a knockout', () => {
    /* The receipt scrolls; the title and the "now do this" row never do. The
       scrim is shortened to a 300 px band so the sheet must overflow. */
    const A = window.HearthriseAccrual;
    const D = window.HearthriseDeathSheet;
    if (!A || typeof A.applyEnvelopeState !== 'function' || !D || typeof D.show !== 'function') {
      skip('the recovery seam is not wired'); return;
    }
    const wasOn = A.isServerAccrualEnabled();
    const check = (path) => {
      const scrim = document.getElementById('hr-death-scrim');
      assert(scrim && scrim.classList.contains('show'), path + ': the sheet did not open');
      scrim.style.bottom = Math.max(0, window.innerHeight - 300) + 'px';
      ['.hr-death-top h2', '.hr-death-acts .btn'].forEach((sel) => {
        const el = scrim.querySelector(sel), r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        assert(hit && el.contains(hit), path + ': "' + el.textContent.slice(0, 40) + '" is off screen or '
          + 'covered at scroll 0 (hit ' + (hit && hit.className) + ', bottom ' + Math.round(r.bottom) + ')');
      });
    };
    try {
      A.setServerAccrualEnabled(true);
      A.clearFall(); D.__resetForTest();
      A.noteFall(Date.now()); D.show(null, null);
      check('attended fall');
      D.__resetForTest(); A.clearFall();
      A.applyEnvelopeState(window.G, { state: { accrued_to: new Date().toISOString(),
        recovering_until: new Date(Date.now() + 27 * 60000).toISOString() } });
      check('reload into a knockout');
    } finally {
      try { document.getElementById('hr-death-scrim').style.bottom = ''; } catch (e) {}
      try { D.__resetForTest(); A.clearFall(); A.applyEnvelopeState(window.G, { state: { recovering_until: null } }); } catch (e) {}
      A.setServerAccrualEnabled(!!wasOn);
    }
  }),

  () => tryRun('RECOVER-12: a server-stated knockout stops the SWING BAR and says so — the fight '
    + 'never freezes silently, and it resumes on its own', () => {
    /* ══ THE P0 TYLER PLAYED ON b510 (2026-09-06) ════════════════════════
       "after I kill one dark wizard the swing timer just keeps going but
       nothing happens."

       b510 gave the live tick its first early return: `combatTick` asks
       `hrCombatDown()` and refuses to swing while the character is off their
       feet (src/legacy.js). Correct. What was missing is that NOTHING ELSE
       KNEW. Three facts conspired:
         · the activity pointer survives a fall on purpose, so `activeMonster`
           stays set and every renderer still reads the fight as LIVE;
         · the 2.4 s interval keeps running on purpose (the resume is the
           absence of a change), and the swing bar is stamped by a WRAPPER
           around `combatTick` — not by a swing — so it swept on;
         · `recovering_until` arrives off an ENVELOPE, with no client-side fall
           and therefore no death sheet, whenever the server priced a window
           and found a death in it. That is the ordinary shape after an
           attended run settles.
       Result: a fight that animated forever and did nothing, with no damage,
       no respawn, and not one word to the player. This test is that state. */
    const G = window.G;
    const A = window.HearthriseAccrual;
    const C = window.HearthriseCore;
    const CS = window.HearthriseCombatScreens;
    if (!A || typeof A.applyEnvelopeState !== 'function' || !C || !C.combatSim
        || typeof window.hrCombatDown !== 'function'
        || typeof window.hrCombatDownPeek !== 'function') { skip('the fall seam is not wired'); return; }

    const snap = snapshotG();
    const wasOn = A.isServerAccrualEnabled();
    const realDeclare = window.declareActivity;
    const realNote = A.noteSettleEvent;
    try {
      A.setServerAccrualEnabled(true);
      window.declareActivity = function () { return null; };
      A.noteSettleEvent = function () { return null; };
      A.clearFall();
      A.applyEnvelopeState(G, { state: { recovering_until: null } });

      const mid = window.MONSTERS.slime ? 'slime' : Object.keys(window.MONSTERS)[0];
      const mon = window.MONSTERS[mid];
      const arm = () => {
        G.playerMaxHp = 9999; G.playerHp = 9999;
        G.activeMonster = mid; G.monsterMaxHp = mon.hp; G.monsterHp = mon.hp;
        G.combatLog = [];
      };

      /* ① THE ORDINARY KILL STILL CARRIES THE RUN ON. The control: with
         nobody down, a foe that dies is replaced and the next tick swings. */
      arm();
      G.monsterHp = 1;
      /* SWING UNTIL THE BLOW LANDS, not once. `simulateTick` rolls accuracy
         (`rollAttack` returns 0 on a miss, src/core/combat-sim.js), so one tick
         against a 1-hp foe is a COIN FLIP — this step read a missed swing as
         "the kill did not respawn" and made RECOVER-12 fail about one run in
         three, in isolation, with a message pointing at the knockout gate it
         had not reached yet (measured on the assembled b511 tree: 1169-test
         runs green, red, green). The property being asserted is unchanged and
         the gate is still what it bites: while `hrCombatDown()` is true NO tick
         swings, so a shut gate never lands the blow and this loop still ends on
         a 1-hp slime and fails. Only the "the first swing always hits"
         assumption — which the engine never made — is gone. */
      let landed = false;
      for (let i = 0; i < 40 && !landed; i++) {
        window.combatTick();
        landed = (G.monsterHp === mon.hp);
      }
      assert(G.activeMonster === mid && landed,
        'an ordinary kill did not put a fresh foe up in forty swings: monster=' + G.activeMonster
        + ' hp=' + G.monsterHp + '/' + mon.hp + ' down=' + window.hrCombatDownPeek());
      const afterKill = G.monsterHp;
      for (let i = 0; i < 12 && G.monsterHp === afterKill; i++) window.combatTick();
      assert(G.monsterHp !== afterKill,
        'the fight stopped dealing damage after a kill — twelve swings moved nothing');

      /* ② THE ENVELOPE STATES A KNOCKOUT, WITH NO CLIENT FALL. */
      arm();
      const until = Date.now() + 90000;
      A.applyEnvelopeState(G, {
        state: { recovering_until: new Date(until).toISOString(), deaths_today: 1, deaths_lifetime: 1 },
      });
      assert(A.fallState().phase === 'recovering' && A.isKnockedOut() === true,
        'the recovery line on the envelope did not put the character off their feet: '
        + A.fallState().phase);
      assert(window.hrCombatDownPeek() === true,
        'the PURE read disagrees with the one the tick asks. A renderer cannot call `hrCombatDown` — it owns '
        + 'the stand-up transition — so the two must answer the same question.');

      /* ③ THE PLAYER IS TOLD, ONCE. */
      const hpBefore = G.monsterHp;
      window.combatTick();
      assert(G.monsterHp === hpBefore,
        'the tick swung through a server-stated knockout');
      const said = (G.combatLog || []).filter((l) => /knocked out|waiting on the hearth/i.test(l));
      assert(said.length === 1,
        'a knockout the SERVER stated froze the fight without a word to the player (' + said.length
        + ' lines). A gate nobody can see is indistinguishable from a frozen game — that is exactly '
        + 'what "the swing timer just keeps going but nothing happens" is.');
      window.combatTick(); window.combatTick();
      assert((G.combatLog || []).filter((l) => /knocked out|waiting on the hearth/i.test(l)).length === 1,
        'the knockout line is repeated every tick — 25 lines a minute of the same sentence');

      /* ④ AND THE BAR IS PARKED. `Swing.phase()` is 0 only while nothing has
         stamped a swing; the wrapper used to stamp on every CALL, gated or
         not, which is the animation Tyler was watching. */
      if (CS && CS._swing && typeof CS._swing.phase === 'function') {
        CS._swing.reset();
        window.combatTick(); window.combatTick();
        assert(CS._swing.phase() === 0,
          'the swing bar was stamped by a tick that never swung, so it animates through a paused '
          + 'fight: phase=' + CS._swing.phase());
      }

      /* ⑤ THE RESUME IS STILL THE ABSENCE OF A CHANGE. */
      A.applyEnvelopeState(G, { state: { recovering_until: null } });
      G.monsterHp = 0;
      assert(window.hrCombatDown() === false && window.hrCombatDownPeek() === false,
        'the gate stayed shut after the recovery line passed');
      assert(G.monsterHp === mon.hp,
        'the fight resumed against a foe on 0 HP, a free kill for having been down: ' + G.monsterHp);
      if (CS && CS._swing && typeof CS._swing.phase === 'function') {
        CS._swing.reset();
        window.combatTick();
        assert(CS._swing.phase() >= 0 && window.hrCombatDownPeek() === false,
          'the bar never restarted once the character was back up');
      }
      const dmgFrom = G.monsterHp;
      for (let i = 0; i < 12 && G.monsterHp === dmgFrom; i++) window.combatTick();
      assert(G.monsterHp !== dmgFrom,
        'damage never resumed after the knockout passed — twelve swings moved nothing');
    } finally {
      window.declareActivity = realDeclare;
      A.noteSettleEvent = realNote;
      try { A.clearFall(); } catch (e) {}
      try { A.applyEnvelopeState(window.G, { state: { recovering_until: null } }); } catch (e) {}
      A.setServerAccrualEnabled(!!wasOn);
      /* AND PUT THE SHEET AWAY. Step (2) states a recovery 90 s out, which is a
         RAISE — the death sheet is a full-screen overlay and it does not close
         itself until the line passes, so leaving it up hands every later test a
         page with a modal over it (measured on the assembled tree: "b221: the
         shop renders the counter scene" failed on `something is covering the buy
         control COVER=<span>.hr-death-t`, once RECOVER-12 started reaching this
         far). `__resetForTest()` is the ONE teardown every fall fixture uses: it
         closes the sheet AND retires the pending fall, the recovery line and both
         raise latches together — closing alone leaves the line running, and the
         next envelope of the same knockout puts the sheet straight back up. */
      try { window.HearthriseDeathSheet.__resetForTest(); } catch (e) {}
      try { window.stopCombat(); } catch (e) {}
      restoreG(snap);
    }
  }),

  () => tryRun('RECOVER-15: a DISMISSED knockout is never re-raised, and one teardown retires the whole fall', () => {
    /* ══ THE LEAK THIS CLOSES (measured on b513, 2026-09-07) ══════════════
       "b221: the shop renders the counter scene with every offer reachable"
       went red intermittently — three runs in five — on
       `something is covering the buy control COVER=<span>.hr-death-t`. That
       span is a ROW OF THIS SHEET. Nothing near b221 goes anywhere near a
       death: the sheet had been raised hundreds of tests earlier and was still
       on screen, and the shop test was simply the next thing to hit-test a
       control.

       THE MECHANISM. `maybeRaiseRecovery` raises once per recovery window,
       latched on the server's absolute `until` — correct, and the whole reason
       a settle every few seconds does not re-open a sheet the player just
       dismissed. But the latch was the ONLY memory of the dismissal, and the
       teardown every fall fixture carried was `close(); _resetRaise();` —
       which clears exactly that latch while the recovery line is still
       RUNNING. The next envelope of the same knockout then re-opened the sheet
       behind the suite's back, over whatever screen the run had reached.

       So the dismissal is now its own fact (`dismissedUntil`), which a reset of
       the raise latch cannot resurrect, and `__resetForTest()` retires all four
       things a fall leaves behind — the sheet, both latches, the pending fall
       and its re-ask timer, and the server's recovery line — because retiring
       three of them is what left this running.

       MUTATION: drop the `dismissedUntil === f.until` clause in
       maybeRaiseRecovery -> ② RED. Reduce `__resetForTest()` to a bare
       `close()` -> ④ RED. */
    const G = window.G;
    const A = window.HearthriseAccrual;
    const D = window.HearthriseDeathSheet;
    if (!A || typeof A.applyEnvelopeState !== 'function' || typeof A.noteFall !== 'function'
        || !D || typeof D.__resetForTest !== 'function') { skip('the recovery seam is not wired'); return; }

    const snap = snapshotG();
    const wasOn = A.isServerAccrualEnabled();
    const scrim = () => document.getElementById('hr-death-scrim');
    const up = () => { const el = scrim(); return !!(el && el.classList.contains('show')); };
    const envelope = (until) => A.applyEnvelopeState(G, {
      state: {
        accrued_to: new Date().toISOString(),
        recovering_until: until ? new Date(until).toISOString() : null,
      },
    });
    try {
      A.setServerAccrualEnabled(true);
      D.__resetForTest();
      G.playerMaxHp = 13; G.playerHp = 5;

      /* ① THE KNOCKOUT ARRIVES ON AN ENVELOPE AND THE SHEET GOES UP ONCE. */
      const first = Date.now() + 9 * 60000;
      envelope(first);
      assert(A.fallState().phase === 'recovering',
        'the fixture did not reach a recovery window: ' + A.fallState().phase);
      assert(up(), 'a stated knockout did not raise the sheet at all — the fixture is not exercising the raise');

      /* ② DISMISSED, THEN THE RAISE LATCH IS RE-ARMED UNDER IT — exactly what
            the old `close(); _resetRaise();` teardown did — and the next
            envelope of THE SAME knockout must still find the sheet closed. */
      D.close();
      D._resetRaise();
      envelope(first);
      assert(!up(),
        'THE b513 LEAK: a recovery window the player had already dismissed re-opened its sheet as '
        + 'soon as the raise latch was cleared under it. From here the sheet sits over every later '
        + 'screen in the run, and the failure surfaces hundreds of tests away as "something is '
        + 'covering the buy control COVER=<span>.hr-death-t" on a test that has nothing to do with '
        + 'dying.');

      /* ③ AND IT IS A DISMISSAL, NOT A MUTE. A NEW knockout — a new `until` —
            is still announced, or the fix would have deleted the feature. */
      const second = Date.now() + 21 * 60000;
      envelope(second);
      assert(up(), 'a SECOND, later knockout was swallowed: the dismissal must be per window, not a mute switch');

      /* ④ ONE TEARDOWN RETIRES THE WHOLE FALL. Not just the DOM: the pending
            fall (and the re-ask timer it owns) and the server's recovery line
            are what put the sheet back up, so a teardown that only closes is
            the leak wearing a tidy name. */
      A.noteFall(Date.now());
      D.__resetForTest();
      assert(!up(), '__resetForTest left the sheet on screen');
      assert(A.fallState().phase !== 'recovering' && A.recoveringUntilMs() === 0,
        '__resetForTest left the recovery line running, so the next envelope raises the sheet again: '
        + JSON.stringify({ phase: A.fallState().phase, until: A.recoveringUntilMs() }));
      assert(A.fallState().phase === 'up' && A.fallReaskAt() === 0,
        '__resetForTest left a pending fall (and its re-ask timer) behind: '
        + JSON.stringify({ phase: A.fallState().phase, reaskAt: A.fallReaskAt() }));

      /* AND NOTHING RAISES ON A CLIENT THAT IS UP. An envelope that states no
         recovery line is the ordinary case, thousands of times a session. */
      envelope(null);
      assert(!up(), 'an envelope with no recovery line raised the knockout sheet');
    } finally {
      try { D.__resetForTest(); } catch (e) {}
      A.setServerAccrualEnabled(!!wasOn);
      restoreG(snap);
    }
  }),

  () => tryRun('RECOVER-16 (b527, rev. 3): KNOCKED OUT, a gather tap RUNS and a combat tap is refused '
    + 'and answered by the sheet — the window costs the fight, not the game', () => {
    /* ══ THE RULING THIS TEST HOLDS (game-designer, 2026-09-08, rev. 3) ══════════
       Rev. 2 refused EVERY payable kind inside a recovery window and this test
       was written to hold that. Measured live: a solvent Fishing-9 / Cooking-15
       character with an empty food bag was refused fishing for 45 minutes, with
       no Market listings and no counter selling food — NO LEGAL MOVE. The
       knockout punishes fighting badly, and fishing for your own dinner is the
       CURE it is supposed to teach. Rev. 3 narrows `set-activity.js` §1b
       and its client mirror to `combat` alone (`RECOVERY_REFUSED_KINDS` in
       src/core/away.js — ONE array, both runtimes).

       So the contract is TWO-SIDED and both sides are asserted here: a gate
       that refuses nothing passes ②, one that refuses everything passes ③.

       WHAT DID NOT SOFTEN, only move to the combat arm: the client must never
       paint a run the server refuses. Measured 2026-09-07 17:22 UTC — a
       knocked-out client painted four minutes of fishing, a Qty badge climbing
       37 → 51 and a header inventing "Level 7 · 712/857 XP", while
       `player_intents` held no row and server fishing xp stayed at 604. ④ is
       the other live symptom: the refused tap did NOTHING AT ALL, no run and no
       sheet, which reads as a dropped input. The answer is VERIFIED now, so ④
       asserts the player was TOLD, not that `show()` was called.

       MUTATION: make `hrRefuseWhileRecovering` refuse every declared kind
       (rev. 2) → ② RED; refuse nothing → ③ and ④ RED; make the sheet's
       `show()` a no-op → ④ RED; ignore `hrCombatDownPeek()` → ⑥ RED.
       Mutating `isOpen` alone does NOT go red, and correctly so. */
    const G = window.G;
    const A = window.HearthriseAccrual;
    const D = window.HearthriseDeathSheet;
    const M = window.HearthriseActivity;
    const SR = window.HearthriseSkillRecord;
    const AW = window.HearthriseCore && window.HearthriseCore.away;
    const spot = (window.FISH_SPOTS || []).find((f) => f.id === 'shrimp_s') || (window.FISH_SPOTS || [])[0];
    const FOE = (window.MONSTERS || {}).goblin ? 'goblin' : Object.keys(window.MONSTERS || {})[0];
    if (!A || typeof A.applyEnvelopeState !== 'function' || !D || typeof D.__resetForTest !== 'function'
        || !M || typeof M.declare !== 'function' || !spot || !FOE
        || !AW || typeof AW.recoveryRefuses !== 'function'
        || typeof window.startSkill !== 'function' || typeof window.startCombat !== 'function'
        || typeof window.__isSkillLoopArmed !== 'function') {
      skip('the recovery/activity seam is not wired'); return;
    }

    const snap = snapshotG();
    const wasOn = A.isServerAccrualEnabled();
    const hadFlag = window.__HR_TEST_HARNESS__;
    const realDeclare = M.declare;
    let calls = [];
    const scrim = () => document.getElementById('hr-death-scrim');
    const up = () => { const el = scrim(); return !!(el && el.classList.contains('show')); };
    const envelope = (until) => A.applyEnvelopeState(G, {
      state: {
        accrued_to: new Date().toISOString(),
        recovering_until: until ? new Date(until).toISOString() : null,
      },
    });
    /* THE DISPLAY read, not the raw blob — the header that invented "Level 7"
       reads through exactly this. */
    const shownXp = () => (SR && typeof SR.skillXpForDisplay === 'function'
      ? SR.skillXpForDisplay(G, 'fishing').value : (G.skills && G.skills.fishing) || 0);
    try {
      A.setServerAccrualEnabled(true);
      D.__resetForTest();
      /* The pre-fight advisory is not what this test measures; RECOVER-19 owns
         it. Suppressed so ③ reaches the recovery gate and not a dialog. */
      window.__HR_TEST_HARNESS__ = true;
      /* THE SPY IS THE LAST THING BEFORE THE TRANSPORT (same placement as the
         B348 family): it proves what was and was not declared, and it is what
         keeps this test off the network. */
      M.declare = function (kind, id) { calls.push({ kind, id }); return null; };
      try { window.stopSkill(); } catch (e) {}
      try { window.stopCombat(); } catch (e) {}
      M.setConfirmedActivity(null);
      /* HURT, so the relief valve is on the sheet at all: `Rest at the Hearth`
         is offered only while the timer runs AND there is health to buy back,
         because `hr_rest` refuses both of those cases server-side. */
      G.playerMaxHp = 13; G.playerHp = 5;

      /* ① THE SERVER STATES THE KNOCKOUT, and the player DISMISSES the sheet
            it raises. From here the only thing that can put a sheet back on
            screen for this window is a tap itself — `dismissedUntil` refuses
            every envelope-driven raise — so ④ cannot pass by accident. */
      envelope(Date.now() + 44 * 60000);
      assert(A.isKnockedOut(), 'the fixture never reached a knockout: ' + JSON.stringify(A.fallState()));
      D.close();
      assert(!up(), 'the fixture could not put the sheet away, so ④ would prove nothing');

      /* ⓪ THE RULE ITSELF, from its one definition: if the array ever grows
            back, THIS should fail, not a mystery about a fishing rod. */
      assert(AW.recoveryRefuses('combat') && !AW.recoveryRefuses('gather') && !AW.recoveryRefuses('artisan'),
        'RECOVERY_REFUSED_KINDS is not the rev. 3 set (combat only): '
        + JSON.stringify(AW.RECOVERY_REFUSED_KINDS) + '. The server imports this same array');

      /* ② THE CURE IS NOT LOCKED: the gather tap must work COMPLETELY —
            pointer, loop and declaration — or dinner is unreachable. */
      calls = [];
      window.startSkill('fishing', spot.id, spot.ms);
      assert(G.activeSkill === 'fishing' && G.skillTargetId === spot.id,
        'a knocked-out character could not start fishing (' + G.activeSkill + '/' + G.skillTargetId
        + '): rev. 3 pays gathering in full during recovery, and refusing it is the 45-minute dead sit');
      assert(window.__isSkillLoopArmed(), 'the gather run started with no loop armed');
      assert(calls.length === 1 && calls[0].kind === 'gather' && calls[0].id === spot.id,
        'the allowed gather run did not DECLARE itself (' + JSON.stringify(calls) + '): a run the '
        + 'server was never told about is unpaid and gone on reload');

      /* ③ AND THE FIGHT IS STILL SHUT. This is the exploit the ladder prices
            (R1: earning COMBAT output while down) and it does not move. */
      try { window.stopSkill(); } catch (e) {}
      D.close();
      G.activeMonster = null;
      const invBefore = JSON.stringify(G.inventory || {});
      const xpBefore = shownXp();
      const hpBefore = G.playerHp;
      calls = [];
      window.startCombat(FOE);
      assert(!G.activeMonster,
        'a knocked-out character started a FIGHT (' + G.activeMonster + '): the server refuses combat '
        + 'for the whole window before hr_apply, so every swing it paints is gone on reload');
      assert(calls.length === 0,
        'the refused fight still DECLARED (' + JSON.stringify(calls) + '): an idempotency key and a '
        + 'rate budget spent to be told `recovering` is a round trip bought to learn nothing');

      /* ④ AND THE PLAYER IS TOLD — measured live, the refused tap did nothing
            visible, which is indistinguishable from a dropped input. */
      assert(up(), 'the combat tap was refused in SILENCE — a player who taps a monster and sees '
        + 'nothing happen files "the game ignored me", and they are right to');
      assert(/Back on your feet in|Knocked out/.test((scrim().textContent) || ''),
        'the sheet that answered the tap is not the recovery sheet: '
        + ((scrim().textContent) || '').slice(0, 140));
      /* The CONTROL, not its label: "No food to rest with" is still the right
         answer to the tap for a player with an empty bag. */
      assert(!!scrim().querySelector('[data-act="rest"]'),
        'the recovery sheet offered no Rest control — the one action that shortens the wait is why '
        + 'this sheet is the right answer to the tap rather than a toast');

      /* ⑤ AND NOTHING MOVED for the refused tap. */
      assert(JSON.stringify(G.inventory || {}) === invBefore,
        'the refused fight still moved the bag: ' + JSON.stringify(G.inventory || {}).slice(0, 160));
      assert(shownXp() === xpBefore && G.playerHp === hpBefore,
        'the refused fight moved the DISPLAYED state (fishing xp ' + xpBefore + '→' + shownXp()
        + ', hp ' + hpBefore + '→' + G.playerHp + '): the header is server xp + prediction, so a '
        + 'phantom run shows a level the server never granted');

      /* ⑥ CONTROL: stand them up and the FIGHT must work, or a gate that
            refused combat forever would pass everything above. */
      D.__resetForTest();
      envelope(null);
      assert(!A.isKnockedOut(), 'the control could not stand the player up: ' + JSON.stringify(A.fallState()));
      calls = [];
      window.startCombat(FOE);
      assert(G.activeMonster === FOE,
        'CONTROL: a character who is UP could not start a fight (' + G.activeMonster
        + ') — the gate is refusing more than the server does');
      assert(calls.length === 1 && calls[0].kind === 'combat' && calls[0].id === FOE,
        'CONTROL: the fight did not declare itself (' + JSON.stringify(calls) + ')');
    } finally {
      M.declare = realDeclare;
      try { M.setConfirmedActivity(null); } catch (e) {}
      try { window.stopSkill(); } catch (e) {}
      try { window.stopCombat(); } catch (e) {}
      try { D.__resetForTest(); } catch (e) {}
      window.__HR_TEST_HARNESS__ = hadFlag;
      A.setServerAccrualEnabled(!!wasOn);
      restoreG(snap);
    }
  }),

  () => tryRun('RECOVER-20 (rev. 3): with the sheet taken away, a refused tap is still ANSWERED by '
    + 'notify — and with no surface at all answerTap admits it failed', () => {
    /* RECOVER-16 ④ proves the SHEET answers the tap. It cannot prove the FLOOR:
       `answerTap` tries the sheet first, so on every green run `notify` is
       never reached and that branch has never executed in a test — while the
       measured symptom was a refusal with NO surface at all.
       MUTATION: drop the `window.notify(...)` line from answerTap → ② RED. */
    const D = window.HearthriseDeathSheet;
    if (!D || typeof D.answerTap !== 'function' || typeof D.__setOpenerForTest !== 'function'
        || typeof D.__resetForTest !== 'function') {
      skip('the death-sheet answer seam is not wired'); return;
    }
    const realNotify = window.notify;
    const scrim = () => document.getElementById('hr-death-scrim');
    const up = () => { const el = scrim(); return !!(el && el.classList.contains('show')); };
    let said = [];
    try {
      D.__resetForTest();
      D.__setOpenerForTest(function () { return null; });   // the sheet, taken away
      assert(!up(), 'the fixture could not put the sheet away, so the floor cannot be reached');

      /* ① AND IT STAYS AWAY. If the stub did not take, ② would pass on the
            sheet and this test would measure nothing. */
      window.notify = function (msg, kind) { said.push({ msg, kind }); };
      const LINE = 'Knocked out — back on your feet in 12m';
      const told = D.answerTap(LINE);
      assert(!up(), 'the opener stub did not take — the sheet is on screen, so the notify floor was '
        + 'never reached and this test proves nothing');

      /* ② THE FLOOR CARRIES THE LINE, not a generic ping: the player has to
            learn WHY the tap did nothing, in the same gesture. */
      assert(told === true, 'answerTap reported the player was NOT told, although notify was wired: '
        + 'a refusal that reports itself unanswered will make its caller retry or fall silent');
      assert(said.length === 1 && said[0].msg === LINE,
        'the floor did not carry the refusal line (' + JSON.stringify(said).slice(0, 160) + '): a toast '
        + 'that says nothing is the dead tap with extra steps');

    } finally {
      D.__setOpenerForTest(null);
      if (typeof realNotify === 'function') window.notify = realNotify;
      else { try { delete window.notify; } catch (e) {} }
      try { D.__resetForTest(); } catch (e) {}
    }
  }),

  () => tryRun('RECOVER-21 (rev. 3): with NO surface at all — no sheet, no notify — answerTap admits '
    + 'the player was not told', () => {
    /* The other half, and its own test because it is its own property: "reports
       true" is worthless without "reports false when nothing was said". A
       function that always claims the player was told is the swallowed refusal
       wearing a return value, and its callers stop looking.
       MUTATION: `return true` at the end of answerTap → RED. */
    const D = window.HearthriseDeathSheet;
    if (!D || typeof D.answerTap !== 'function' || typeof D.__setOpenerForTest !== 'function'
        || typeof D.__resetForTest !== 'function') {
      skip('the death-sheet answer seam is not wired'); return;
    }
    const realNotify = window.notify;
    try {
      D.__resetForTest();
      D.__setOpenerForTest(function () { return null; });
      try { delete window.notify; } catch (e) { window.notify = undefined; }
      assert(D.answerTap('Knocked out') === false,
        'with no sheet and no notify, answerTap still claimed the player was told — the dropped-tap '
        + 'report is then unreproducible, because the code says it answered');
    } finally {
      D.__setOpenerForTest(null);
      if (typeof realNotify === 'function') window.notify = realNotify;
      else { try { delete window.notify; } catch (e) {} }
      try { D.__resetForTest(); } catch (e) {}
    }
  }),

  /* RETIRED (lane C2, the closed rebuild): "RECOVER-19 a BOOT RESUME while knocked out raises no pre-fight warning and runs no local fight — the k" — it covered a system C2 deleted
     outright (away combat span, Recovery ladder / Retreat, daily login, charms, enchant, Auto-Eat or the
     night forecast). The surviving behaviour is graded by tests/hunt-sessions-*.mjs and core-loop.mjs. */
  () => tryRunAsync('RECOVER-17 (b520): an IDLE BOOT hydrates the recovery line — the reload no longer '
    + 'stands a knocked-out hero up', async () => {
    const G = window.G;
    const R = window.HearthriseRecord;
    const A = window.HearthriseAccrual;
    const D = window.HearthriseDeathSheet;
    if (!R || typeof R.requestRecord !== 'function' || typeof R.getRecordState !== 'function'
        || !A || typeof A.reconcileFall !== 'function' || !D || typeof D.__resetForTest !== 'function'
        || typeof window.refreshActivityBar !== 'function') {
      skip('the boot-record / recovery seam is not wired'); return;
    }
    /* An honest SKIP rather than a race: if a real load already holds the
       single-flight latch, `requestRecord` would hand us ITS verdict. */
    if (R.getRecordState().pending) { skip('a record load is already in flight'); return; }

    const snap = snapshotG();
    const realFetch = window.fetch;
    const recBefore = (G && G._record) ? JSON.parse(JSON.stringify(G._record)) : null;
    const hadConfig = !!(typeof R.getRecordConfig === 'function' && R.getRecordConfig());
    const until = Date.now() + 11 * 60000;
    /* THE FIXTURE OWNS THE WATERMARK IT MEASURES (b538): accrue.js's is a module-local
       with no reset seam that only applyEnvelopeState writes, so read it BEFORE the boot
       and put a distinctly PAST instant (`priced`) on the wire — filtered run or full. */
    const wmBefore = A.accruedToMs(); const priced = Date.now() - 90000;
    let asked = 0;
    try {
      D.__resetForTest();                 // stands the fixture up, through an envelope
      A.clearFall();
      /* THE MEASURED SHAPE: nothing declared, hurt, and down. STOPPED rather
         than seeded null — the pointer and the TIMER move together that way, and
         a fixture that nulls the pointer while an interval is still armed is the
         exact phantom this test exists to catch. */
      try { window.stopSkill(); } catch (e) {}
      try { window.stopCombat(); } catch (e) {}
      try { if (typeof window._stopArtisan === 'function') window._stopArtisan(); } catch (e) {}
      G.playerMaxHp = 13; G.playerHp = 5;
      assert(!G.activeMonster && !G.activeSkill && !G.skillTargetId && !G.activeArtisanRecipe,
        'the fixture could not stop everything (' + G.activeMonster + '/' + G.activeSkill + '/'
        + G.activeArtisanRecipe + '), so "the boot did not resume a run" would prove nothing');
      assert(!A.isKnockedOut() && A.fallState().phase === 'up',
        'the fixture did not start on its feet, so nothing below would prove anything: '
        + JSON.stringify(A.fallState()));

      window.fetch = function (u) {
        if (!/hr_load/.test(String(u))) return realFetch.apply(this, arguments);
        asked++;
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          version: ((recBefore && Number(recBefore.version)) || 0) + 1,
          now: new Date().toISOString(),
          state: {
            slot: 0,
            gold: Math.floor(Number(G.gold) || 0),      // a no-op write; the record needs one field
            accrued_to: new Date(priced).toISOString(),
            active_kind: 'idle', active_id: null,       // ← THE IDLE BOOT
            hp: 5, max_hp: 13,
            recovering_until: new Date(until).toISOString(),
            deaths_today: 2, deaths_lifetime: 5,
          },
        }), { status: 200 }));
      };
      if (!hadConfig) {
        R.configureRecord({ url: 'https://proj.supabase.co', apiKey: 'anon', authToken: () => 'jwt', slot: 0 });
      }

      const verdict = await R.requestRecord();
      assert(asked === 1 && verdict && verdict.outcome === 'loaded',
        'the fixture boot read did not land (' + asked + ' asks): ' + JSON.stringify(verdict));

      /* ① THE LINE ARRIVED. This is the whole bug: before the fix the boot body
            carried `recovering_until` and NOTHING read it. */
      assert(A.isKnockedOut(),
        'an IDLE boot carrying a live `recovering_until` came up ON ITS FEET. That is the b519 bug: '
        + 'the hero is down for 11 more minutes, the server refuses combat, and the client '
        + 'does not know: ' + JSON.stringify(A.fallState()));
      const st = A.fallState();
      assert(st.phase === 'recovering' && Math.abs(st.until - until) < 1500,
        'the fall-state machine did not end in `recovering` at the SERVER instant: ' + JSON.stringify(st));
      assert(A.recoveringUntilMs() === st.until && typeof window.hrCombatDownPeek === 'function'
        && window.hrCombatDownPeek() === true,
        'the gate every start reads (`hrCombatDownPeek`) is still blind after the boot: '
        + window.hrCombatDownPeek());

      /* ② AND THE DEATH COUNTERS CAME WITH IT — the sheet renders the server's
            ladder rung from these rather than re-deriving one from the lifetime
            tally, which is how it once promised 2 minutes for a free fall. */
      assert(A.deathsToday() === 2 && A.deathsLifetime() === 5,
        'the boot did not hydrate the server\'s death counters: today=' + A.deathsToday()
        + ' lifetime=' + A.deathsLifetime());
      /* ②b WHERE `accrued_to` GOES, AND WHERE IT MUST NOT (b538). This read
            `accruedToMs() > 0` — which the boot never does: record.js's fall step
            and accrue.js reconcileFall both state it must not move the watermark
            (it feeds the welcome-back card's absence). It passed on RECOVER-16's
            leftover and was RED run alone, so assert the SPLIT instead. MUTATION:
            accruedToAt written in reconcileFall → second RED; applyRecord dropped
            from requestRecord → first. */
      const rv = (typeof R.recordValue === 'function') ? R.recordValue(G, 'offlineBudget') : null;
      assert(rv && rv.known === true && rv.value && Number(rv.value.at) === priced,
        'the boot did not hand `accrued_to` to the field that owns it (offlineBudget): ' + JSON.stringify(rv));
      assert(A.accruedToMs() === wmBefore, 'the BOOT read moved accrue.js\'s priced-window watermark ('
        + wmBefore + ' → ' + A.accruedToMs() + '): only a settle may — it feeds the welcome-back absence');

      /* ③ THE ALWAYS-ON READOUT NAMES THE COUNTDOWN. The pointer is IDLE, which
            used to fall straight through to "Idle — pick an activity": the
            one surface on screen for every second of the knockout said nothing
            about it. */
      window.refreshActivityBar();
      const nameEl = document.getElementById('ab-name');
      if (nameEl) {
        assert(/Knocked out/.test(nameEl.textContent) && /1[01]m/.test(nameEl.textContent),
          'the activity bar does not name the knockout after an IDLE boot: ' + nameEl.textContent);
      }
      const bar = document.getElementById('activity-bar');
      if (bar) {
        assert(bar.classList.contains('knocked-out') && !bar.classList.contains('idle'),
          'the bar is still styled as an idle character while the server has them on the floor: '
          + bar.className);
      }

      /* ④ AND THE SHEET RAISED ITSELF OFF THE SAME BOOT, with the bag already
            hydrated — which is why the recovery step runs AFTER inventory. */
      const scrim = document.getElementById('hr-death-scrim');
      assert(scrim && scrim.classList.contains('show'),
        'a reload into a live knockout showed the player NOTHING — no sheet, no countdown, no Rest');

      /* ⑤ AND NO STEP THREW ON THE WAY. `partial` is the boot's own casualty list. */
      const boot = (typeof R.bootHydrationState === 'function') ? R.bootHydrationState() : null;
      assert(!boot || !Array.isArray(boot.partial) || boot.partial.indexOf('recovery') === -1,
        'the recovery hydration step THREW: ' + JSON.stringify(boot && boot.partial));
    } finally {
      window.fetch = realFetch;
      if (!hadConfig) { try { R.configureRecord(null); } catch (e) {} }
      try { D.__resetForTest(); } catch (e) {}   // retires the line the only legal way
      try { A.clearFall(); } catch (e) {}
      restoreG(snap);
      try { if (recBefore) window.G._record = recBefore; else delete window.G._record; } catch (e) {}
    }
  }),

  () => tryRunAsync('RECOVER-18 (b520, rev. 3 b527): after that boot, a COMBAT tap is refused and '
    + 'answered by the sheet while a gather tap runs — the gate is not blind on a reload', async () => {
    /* REV. 3: the refused kind is `combat` alone (`RECOVERY_REFUSED_KINDS`).
       What this test proves is unchanged and was never about which kind — that
       a knockout hydrated by the BOOT READ, not by a live envelope, arms the
       gate at all — so the tap simply became the one still refused, and ③ now
       holds the other half of the ruling too. MUTATION: drop
       `recovering_until` from the record hydration → ①/② RED. */
    const G = window.G;
    const R = window.HearthriseRecord;
    const A = window.HearthriseAccrual;
    const D = window.HearthriseDeathSheet;
    const M = window.HearthriseActivity;
    const spot = (window.FISH_SPOTS || []).find((f) => f.id === 'shrimp_s') || (window.FISH_SPOTS || [])[0];
    const FOE = (window.MONSTERS || {}).goblin ? 'goblin' : Object.keys(window.MONSTERS || {})[0];
    if (!R || typeof R.requestRecord !== 'function' || typeof R.getRecordState !== 'function'
        || !FOE || typeof window.startCombat !== 'function'
        || !A || typeof A.reconcileFall !== 'function' || !D || typeof D.__resetForTest !== 'function'
        || !M || typeof M.declare !== 'function' || !spot
        || typeof window.startSkill !== 'function' || typeof window.__isSkillLoopArmed !== 'function') {
      skip('the boot-record / recovery / activity seam is not wired'); return;
    }
    if (R.getRecordState().pending) { skip('a record load is already in flight'); return; }

    const snap = snapshotG();
    const realFetch = window.fetch;
    const realDeclare = M.declare;
    const recBefore = (G && G._record) ? JSON.parse(JSON.stringify(G._record)) : null;
    const hadConfig = !!(typeof R.getRecordConfig === 'function' && R.getRecordConfig());
    const hadFlag = window.__HR_TEST_HARNESS__;
    const until = Date.now() + 11 * 60000;
    let calls = [];
    const scrim = () => document.getElementById('hr-death-scrim');
    const up = () => { const el = scrim(); return !!(el && el.classList.contains('show')); };
    try {
      D.__resetForTest();
      A.clearFall();
      /* RECOVER-19 owns the pre-fight advisory; suppressed so ① reaches the
         recovery gate rather than a dialog. */
      window.__HR_TEST_HARNESS__ = true;
      try { window.stopSkill(); } catch (e) {}
      try { window.stopCombat(); } catch (e) {}
      M.setConfirmedActivity(null);
      /* THE SPY IS THE LAST THING BEFORE THE TRANSPORT (the B348 family's
         placement): it proves no declaration was even attempted, and it is what
         keeps this test off the network. */
      M.declare = function (kind, id) { calls.push({ kind, id }); return null; };
      G.activeMonster = null; G.activeSkill = null; G.skillTargetId = null;
      G.playerMaxHp = 13; G.playerHp = 5;

      window.fetch = function (u) {
        if (!/hr_load/.test(String(u))) return realFetch.apply(this, arguments);
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          version: ((recBefore && Number(recBefore.version)) || 0) + 1,
          now: new Date().toISOString(),
          state: {
            slot: 0, gold: Math.floor(Number(G.gold) || 0),
            accrued_to: new Date().toISOString(),
            active_kind: 'idle', active_id: null,
            hp: 5, max_hp: 13,
            recovering_until: new Date(until).toISOString(),
            deaths_today: 2, deaths_lifetime: 5,
          },
        }), { status: 200 }));
      };
      if (!hadConfig) {
        R.configureRecord({ url: 'https://proj.supabase.co', apiKey: 'anon', authToken: () => 'jwt', slot: 0 });
      }

      const verdict = await R.requestRecord();
      assert(verdict && verdict.outcome === 'loaded',
        'the fixture boot read did not land: ' + JSON.stringify(verdict));
      assert(A.isKnockedOut(),
        'the boot did not hydrate the knockout, so the tap below would prove nothing: '
        + JSON.stringify(A.fallState()));

      /* THE PLAYER DISMISSES the sheet the boot raised. From here only the TAP
         can put one back for this window (`dismissedUntil` refuses every
         envelope-driven raise), so ② cannot pass by accident. */
      D.close();
      assert(!up(), 'the fixture could not put the sheet away, so the tap would prove nothing');
      const invBefore = JSON.stringify(G.inventory || {});
      calls = [];

      /* ① THE TAP that is still refused after the reload. */
      window.startCombat(FOE);

      assert(!G.activeMonster,
        'a knocked-out character started a FIGHT after a RELOAD (' + G.activeMonster + '). The server '
        + 'refuses combat for the whole recovery window before hr_apply, so every swing this paints '
        + 'is invented and gone on the next reload');
      assert(calls.length === 0,
        'the refused start still DECLARED (' + JSON.stringify(calls) + '): a round trip bought to be '
        + 'told `recovering` by a server the client could already have asked itself');

      /* ② AND THE PLAYER IS TOLD, on the surface that owns the fact. */
      assert(up(),
        'the tap was refused in SILENCE after a reload. A player who taps a monster and sees '
        + 'nothing happen files "the game ignored me", and they are right to');
      assert(/Back on your feet in|Knocked out/.test((scrim().textContent) || ''),
        'the sheet that answered the tap is not the recovery sheet: '
        + ((scrim().textContent) || '').slice(0, 140));
      assert(JSON.stringify(G.inventory || {}) === invBefore,
        'the refused tap still moved the bag: ' + JSON.stringify(G.inventory || {}).slice(0, 160));

      /* ③ AND THE CURE IS OPEN ON THE SAME BOOT. A gate armed by the record
            read must be armed with the rev. 3 RULE, not merely armed. */
      D.close();
      calls = [];
      window.startSkill('fishing', spot.id, spot.ms);
      assert(G.activeSkill === 'fishing' && G.skillTargetId === spot.id,
        'a knocked-out hero could not start fishing after a RELOAD (' + G.activeSkill + '/'
        + G.skillTargetId + '): the boot path re-widened the refusal past combat');
      try { window.stopSkill(); } catch (e) {}

      /* ④ CONTROL: stand the hero up and the refused tap must work, or a
            gate that refused combat forever would pass everything above. */
      D.__resetForTest();
      assert(!A.isKnockedOut(), 'the control could not stand the hero up: ' + JSON.stringify(A.fallState()));
      calls = [];
      window.startCombat(FOE);
      assert(G.activeMonster === FOE,
        'CONTROL: a hero who is UP could not start a fight (' + G.activeMonster
        + ') — the gate is refusing more than the server does');
      assert(calls.length === 1 && calls[0].kind === 'combat' && calls[0].id === FOE,
        'CONTROL: the fight did not declare itself (' + JSON.stringify(calls) + ')');
    } finally {
      window.fetch = realFetch;
      M.declare = realDeclare;
      window.__HR_TEST_HARNESS__ = hadFlag;
      try { window.stopCombat(); } catch (e) {}
      if (!hadConfig) { try { R.configureRecord(null); } catch (e) {} }
      try { M.setConfirmedActivity(null); } catch (e) {}
      try { window.stopSkill(); } catch (e) {}
      try { D.__resetForTest(); } catch (e) {}
      try { A.clearFall(); } catch (e) {}
      restoreG(snap);
      try { if (recBefore) window.G._record = recBefore; else delete window.G._record; } catch (e) {}
    }
  }),

  () => tryRun('SETTINGS-RETIRED-1: Settings offers no save/export/import/backup/erase, even with backup keys present', () => {
    const BK = 'hearthrise:save-backup:v9', SK = 'hearthbound-save-v2';
    const m = document.getElementById('settings-modal');
    try {
      localStorage.setItem(BK, JSON.stringify({ playerName: 'Wiped', lastSeen: Date.now() }));
      localStorage.setItem(SK, '{}');
      window.openSettings();
      const body = document.getElementById('settings-body');
      const heads = [...body.querySelectorAll('summary')].map((s) => s.textContent.trim());
      assert(!heads.includes('Data'), 'Settings still renders a Data section: ' + heads.join(' | '));
      const left = ['#set-save-now', '#set-export', '#set-import', '#set-reset', '[data-restore]'].filter((q) => body.querySelector(q));
      assert(!left.length, 'retired controls still render: ' + left.join(', '));
      const hit = body.textContent.match(/local save|on this device|offline|export|import|backup|erase/i);
      assert(!hit, 'Settings still promises a retired capability: "' + (hit && hit[0]) + '"');
    } finally {
      try { localStorage.removeItem(BK); localStorage.removeItem(SK); } catch (e) {}
      if (m) m.classList.remove('show');
    }
  }),

  // b133: HearthriseDropLog API + recordKill mutation
  () => tryRun('b133: HearthriseDropLog API + recordKill', () => {
    assert(window.HearthriseDropLog, 'HearthriseDropLog missing');
    const required = ['recordKill', 'getMonsterStats', 'getAllStats', 'getMostKilled', 'reset'];
    for (const fn of required) {
      assert(typeof window.HearthriseDropLog[fn] === 'function',
        'HearthriseDropLog.' + fn + ' missing');
    }
    // Snapshot the existing slime entry (real combat tests run earlier in
    // the suite and will have populated this), then verify recordKill
    // increments the kill count + accumulates drops.
    const snap = JSON.parse(JSON.stringify(window.HearthriseDropLog.getAllStats()));
    try {
      // Reset monster slate so the test is deterministic regardless of
      // earlier kills polluting the entry. b135: also captures kill
      // counts as PRIMITIVES before mutating, since getMonsterStats
      // returns the live reference (not a snapshot).
      delete window.G.dropLog['__test_monster__'];
      window.HearthriseDropLog.recordKill('__test_monster__', { test_drop: 2, other: 1 });
      const stats = window.HearthriseDropLog.getMonsterStats('__test_monster__');
      assert(stats, 'recordKill did not create entry');
      const killsAfterFirst = stats.kills;          // capture as primitive
      const dropsAfterFirst = stats.drops.test_drop; // capture as primitive
      assert(killsAfterFirst === 1, 'first kills should be 1, got ' + killsAfterFirst);
      assert(dropsAfterFirst === 2, 'drops.test_drop should be 2, got ' + dropsAfterFirst);
      // Calling again should accumulate, not overwrite.
      window.HearthriseDropLog.recordKill('__test_monster__', { test_drop: 3 });
      const after = window.HearthriseDropLog.getMonsterStats('__test_monster__');
      assert(after.kills === killsAfterFirst + 1,
        'kills should increment to ' + (killsAfterFirst + 1) + ', got ' + after.kills);
      assert(after.drops.test_drop === dropsAfterFirst + 3,
        'drops.test_drop should accumulate to ' + (dropsAfterFirst + 3) + ', got ' + after.drops.test_drop);
    } finally {
      // Clean up: restore original drop log so we don't pollute the player's record.
      window.G.dropLog = snap;
    }
  }),

  // b133: the boot shape carries autoActions + dropLog with safe defaults.
  () => tryRun('b133: boot shape — autoActions + dropLog + plotLevels', () => {
    assert(window.G.autoActions, 'G.autoActions missing — migration v3→v4 not applied');
    assert(window.G.autoActions.eat,
      'G.autoActions.eat missing');
    assert(typeof window.G.autoActions.eat.enabled === 'boolean',
      'G.autoActions.eat.enabled should be boolean');
    assert(window.G.dropLog && typeof window.G.dropLog === 'object',
      'G.dropLog missing — migration v3→v4 not applied');
    /* ⚠ `plotLevels` IS NOT A BOOT FIELD AND THIS READ A LEAK (2026-09-13; see the plot-tier test below). */
    const _lv = window.HearthriseFarm && window.HearthriseFarm.getPlotLevel();
    assert(typeof _lv === 'number' && _lv >= 1,
      'the plot tier Batch C reads is ' + JSON.stringify(_lv) + ' — the Turnip-only default is 1');
  }),

  // b133: drop-log integration with combat — killing a monster via
  // startCombat + stopCombat shouldn't blow up, and if a kill resolves
  // the drop log should record it. We can't reliably resolve a kill
  // synchronously (combat ticks every 2.4s), so we just verify the
  // hook is wired at the source-level by checking recordKill exists
  // and killMonster reaches it without throwing.
  () => tryRun('b133: killMonster path calls into HearthriseDropLog without throwing', () => {
    if (typeof window.killMonster !== 'function') return;
    const snap = JSON.parse(JSON.stringify(window.HearthriseDropLog.getAllStats()));
    try {
      // Manufacture a fake monster + active state, run killMonster.
      const fakeM = { name: 'TestSlime', hp: 1, gp: [0,0], drops: [], xp: 0 };
      const prevActive = window.G.activeMonster;
      window.G.activeMonster = '__test_synthetic__';
      window.G.combatLog = window.G.combatLog || [];
      window.G.stats = window.G.stats || {};
      try {
        window.killMonster(fakeM);
      } catch (e) {
        throw new Error('killMonster threw: ' + (e.message || e));
      } finally {
        window.G.activeMonster = prevActive;
      }
      const recorded = window.HearthriseDropLog.getMonsterStats('__test_synthetic__');
      assert(recorded && recorded.kills >= 1,
        'killMonster did not call HearthriseDropLog.recordKill');
    } finally {
      window.G.dropLog = snap;
    }
  }),





  // b134: maybeStopTraining() stops the active skill when target level is reached.
  () => tryRun('b134: maybeStopTraining stops skill at goal level', () => {
    if (!window.HearthriseAuto || typeof window.HearthriseAuto.maybeStopTraining !== 'function') return;
    if (typeof window.startSkill !== 'function' || typeof window.levelFromXp !== 'function') return;
    const snap = snapshotG();
    const goalBefore = window.HearthriseAuto.getTrainGoal();
    try {
      // Start mining + set goal Lv 2 + give just enough XP to reach Lv 2
      window.G.skills = window.G.skills || {};
      const prevXp = window.G.skills.mining || 0;
      window.startSkill('mining', 'copper_rock', 1500);
      assert(window.G.activeSkill === 'mining', 'activeSkill should be mining');
      // Calibrate XP needed for Lv 2 — bump it past whatever lvFromXp(...) === 2 needs
      window.G.skills.mining = 100; // enough for at least Lv 2 in any reasonable curve
      const lv = window.levelFromXp(window.G.skills.mining);
      window.HearthriseAuto.setTrainGoal({ enabled: true, skillId: 'mining', targetLevel: Math.min(lv, 2) });
      const stopped = window.HearthriseAuto.maybeStopTraining();
      assert(stopped === true, 'maybeStopTraining should return true when goal met, got ' + stopped);
      assert(!window.G.activeSkill, 'activeSkill should be cleared after auto-stop, got ' + window.G.activeSkill);
      // Self-disable check
      const after = window.HearthriseAuto.getTrainGoal();
      assert(after.enabled === false, 'trainGoal.enabled should self-disable after firing');
    } finally {
      window.HearthriseAuto.setTrainGoal(goalBefore);
      if (typeof window.stopSkill === 'function') try { window.stopSkill(); } catch {}
      restoreG(snap);
    }
  }),

  // b134: maybeStopTraining is a no-op for the wrong skill (training Mining
  // shouldn't stop because the player set a Cooking goal).
  () => tryRun('b134: maybeStopTraining ignores non-matching skill', () => {
    if (!window.HearthriseAuto || typeof window.startSkill !== 'function') return;
    const snap = snapshotG();
    const goalBefore = window.HearthriseAuto.getTrainGoal();
    try {
      window.startSkill('mining', 'copper_rock', 1500);
      // Goal is Cooking, but we're mining
      window.HearthriseAuto.setTrainGoal({ enabled: true, skillId: 'cooking', targetLevel: 1 });
      const stopped = window.HearthriseAuto.maybeStopTraining();
      assert(stopped === false, 'maybeStopTraining should not fire for mismatched skill');
      assert(window.G.activeSkill === 'mining', 'mining should still be active');
    } finally {
      window.HearthriseAuto.setTrainGoal(goalBefore);
      if (typeof window.stopSkill === 'function') try { window.stopSkill(); } catch {}
      restoreG(snap);
    }
  }),
  /* ══ KO-* — THE KNOCKED-OUT SHEET TELLS ONE STORY (CLAUDE.md §6) ════════════
     MEASURED LIVE: 'Slain by Slime · 3 kills first' became 'Slain in battle · no
     kills' on a reload, and the tip read today's bag instead of the bag at the
     fall. ROOT CAUSE: the sheet read the event from client scratch and state as
     it is NOW, and was announced partway through the apply on both doors.
     Mutations proven in the commit messages (M1-M9). */
  /* RETIRED (lane C2, the closed rebuild): "KO-RELOAD-1 (attended): the sheet reads the same before and after a reload" — it covered a system C2 deleted
     outright (away combat span, Recovery ladder / Retreat, daily login, charms, enchant, Auto-Eat or the
     night forecast). The surviving behaviour is graded by tests/hunt-sessions-*.mjs and core-loop.mjs. */
  /* RETIRED (lane C2, the closed rebuild): "KO-RELOAD-1 (away): the envelope-raised sheet equals the reloaded one, Rest priced" — it covered a system C2 deleted
     outright (away combat span, Recovery ladder / Retreat, daily login, charms, enchant, Auto-Eat or the
     night forecast). The surviving behaviour is graded by tests/hunt-sessions-*.mjs and core-loop.mjs. */
  /* RETIRED (lane C2, the closed rebuild): "RETREAT-PAIRED: a record that says the engine retreated is still believed" — it covered a system C2 deleted
     outright (away combat span, Recovery ladder / Retreat, daily login, charms, enchant, Auto-Eat or the
     night forecast). The surviving behaviour is graded by tests/hunt-sessions-*.mjs and core-loop.mjs. */
  /* RETIRED (lane C2, the closed rebuild): "WELCOME-AE-OFF-1: the auto-eat-off line never quotes today's bag as the night's" — it covered a system C2 deleted
     outright (away combat span, Recovery ladder / Retreat, daily login, charms, enchant, Auto-Eat or the
     night forecast). The surviving behaviour is graded by tests/hunt-sessions-*.mjs and core-loop.mjs. */
  /* RETIRED (lane C2, the closed rebuild): "HOME-KO-CLOCK-1:…" — it covered a system C2 deleted
     outright (away combat span, Recovery ladder / Retreat, daily login, charms, enchant, Auto-Eat or
     Vigour). The surviving behaviour is graded by tests/hunt-sessions-*.mjs and core-loop.mjs. */
  () => tryRun('FOE-A: the weak line is the engine match, over a KNOWN record, never bare hands', () => {
    const F = window.HearthriseFoe;
    const f = (eq, known) => F.facts('goblin', { eq, known, charms: null });
    const off = f({ weaponType: 'hammer', element: null }, true);
    assert(off && off.note === MONSTER_NOTES.goblin && /weak to 1H Sword/.test(off.weakLine), 'the goblin facts: ' + JSON.stringify(off));
    assert(/already/.test(f({ weaponType: 'sword' }, true).weakLine), 'a held sword did not say already');
    assert(!/already/.test(f({ weaponType: 'sword' }, false).weakLine), 'an unknown record said already');
    assert(!/already/.test(f({ weaponType: 'neutral' }, true).weakLine), 'bare hands said already');
  }),

  /* The charm-gated element curtain left with the Bestiary charms in the
     2026-10-14 demolition; what remains is the weapon tip. */
  () => tryRun('FOE-B: the outmatched tip names the weapon, and no element curtain is drawn', () => {
    const F = window.HearthriseFoe, D = window.HearthriseDeathSheet;
    const facts = F.facts('goblin', { eq: { weaponType: 'hammer', element: null }, known: true, charms: null });
    assert(facts && !facts.elementLine, 'the demolished element curtain came back: ' + JSON.stringify(facts && facts.elementLine));
    const m = D.describeDeath({ ateThisFight: 2, foodQty: 0, monsterName: 'Goblin', foe: facts });
    assert(m.tipKey === 'outmatched' && /1H Sword/.test(m.tip) && !/armou?r|Defence/.test(m.tip), 'the tip: ' + m.tipKey + ' ' + m.tip);
  }),

  () => tryRun('FOE-C: Field notes closes the sheet and opens the Bestiary in front, and never hides Rest', () => {
    const F = window.HearthriseFoe, D = window.HearthriseDeathSheet;
    const base = D.describeDeath({ ateThisFight: 2, foodQty: 0, monsterName: 'Goblin',
      foe: F.facts('goblin', { eq: { weaponType: 'hammer' }, known: true, charms: null }) });
    try {
      D._render(Object.assign({}, base, { actions: [{ k: 'rest', label: 'Rest at the Hearth', disabled: false }] }), { monsterId: 'goblin' });
      assert(!document.querySelector('#hr-death-scrim [data-act="notes"]'), 'the door showed beside an enabled Rest');
      D._render(Object.assign({}, base, { actions: [] }), { monsterId: 'goblin' });
      document.querySelector('#hr-death-scrim [data-act="notes"]').click();
      assert(!document.getElementById('hr-death-scrim').classList.contains('show'), 'the sheet stayed over the Bestiary');
      assert(document.querySelector('#panel-journal.active .jr-tab.active[data-jr-tab="bestiary"]'), 'the Bestiary did not open');
      assert(/Goblin/.test((document.querySelector('#panel-journal .hr-cl-detail') || {}).textContent || ''), 'Field notes did not open the goblin\'s own drop table');
    } finally {
      try { window.showTab('profile'); } catch (e) {}
      D.__resetForTest();
    }
  }),
];
