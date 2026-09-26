// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/away-time-and-offline.js — the daily reward, the hero slot, the away-time unification and the offline honesty surfaces.
//
// Part of the registered suite. The registry (../smoke-test.js) imports every
// domain module in a FIXED order and concatenates them: these tests run against
// one live G, in order, and the order is the contract. Moved here verbatim from
// the monolith by tools/split-smoke-suite.mjs — 116 tests, not one renamed.
// ══════════════════════════════════════════════════════════════════════
import { pass, fail, tryRun, tryRunAsync, assert, skip, stampBalanceLikeLoad, stampRecordLikeLoad, withLocalBlob, withClientOwnedSlots, awaySpan, tryRunRestampingBalance, xpOf, xpMap, predZero, goldOf, snapshotG, onFeet, drain, withResidueWire, seedPlayStreak, residuePurgeSnap, residuePurgeRestore, restoreG, restoreGAndRecord, autoEatMirrorReady, autoEatMirrorFixture, on, snapshot, decideRestore } from './_harness.js?v=553';

export default [

  /* ══════════════════════════════════════════════════════════════════════════
     THE DAILY-REWARD DAY, AND THE TWO WAYS THE SHEET HAS LIED ABOUT IT.

     Shared fixtures for DAILY-SHEET-3 and -4. Both drive the sheet through the
     SAME two doors a player's browser uses:
       · noteServerStreak(envelope) — what hr_load / hr-accrue hand it, carrying
         the character's own daily/login claim rows (the b465 marker rows) and
         the SERVER's clock;
       · G.dailyReward.lastClaimDay + G.streak — the local residue, which is all
         the sheet has before the first envelope lands.
     `cycleDay` and `rewardFor` are asserted directly because they ARE the Home
     card's whole computation (src/features/home-dashboard.js:1041 renders
     'Daily reward · Day ' + DL.cycleDay(G) and DL.rewardFor(G)); the modal is
     asserted through the rendered DOM. */
  () => tryRun('DAILY-SHEET-3 (b475, re-ruled b498): the sheet displays the server\'s CLAIM streak, not the residue', () => {
    /* LIVE-PROVEN (b475): the residue said 1 while the server would pay Day 3,
       so the sheet showed "Day 1 · 500 gold" and the claim credited Day 3 (+5
       gems) — an under-promise, but the same seam as b497's over-promise.

       ⚠ THE MECHANISM CHANGED IN b498 AND THAT IS THE POINT. b475 read
         `state.streak_days`, which is hr_apply's SETTLE streak ("days played"),
         not the CLAIM streak the payout is a function of. The sheet now runs the
         server's own `deriveLoginStreak` over the server's own claim rows, so
         this test drives the mechanism the server actually prices with.
       RED before b475: cycleDay read the residue and rendered Day 1. */
    const D = window.HearthriseDaily, G = window.G, R = window.HearthriseRewards;
    const B = window.HearthriseCore && window.HearthriseCore.botd;
    assert(D && typeof D.noteServerStreak === 'function', 'noteServerStreak must be exported');
    assert(R && typeof R.priceDailyLogin === 'function', 'HearthriseRewards must be present');
    assert(R && typeof R.deriveLoginStreak === 'function',
      'HearthriseRewards.deriveLoginStreak is missing — the sheet and the server\'s pricer must be '
      + 'ONE function (src/data/rewards.js), or the day the sheet shows is a second rule again');
    assert(B && typeof B.utcDayKey === 'function' && typeof B.utcDayNumber === 'function',
      'HearthriseCore.botd.utcDayKey/utcDayNumber missing — the only JS spelling of hr_utc_day_key');
    const snap = snapshotG();
    const sStreak = G.streak, sDR = G.dailyReward;
    try {
      const now = Date.now();
      const dayN = B.utcDayNumber(now);
      const yKey = B.utcDayKey((dayN - 1) * 86400000);       // the SERVER's spelling
      const yLocal = (d => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate())(new Date(now - 86400000));

      D.noteServerStreak(null);                 // start clean
      seedPlayStreak(1);                        // the realm has counted ONE day
      G.dailyReward = { lastClaimDay: yLocal }; // claimed yesterday, claimable today
      /* The envelope: yesterday's login row is CLAIMED and its `value` is the
         streak length ON that day, so today is value + 1 = 3.
         ⚠ streak_days: 5 is a CONTROL. It is the SETTLE streak — a real field on
           a real envelope, and the wrong quantity. If anything ever reads it
           again this test goes red on Day 5 rather than passing by luck. */
      D.noteServerStreak({
        now: new Date(now).toISOString(),
        state: { streak_days: 5 },
        progress: [
          { kind: 'daily', key: 'login', period: yKey, value: 2, state: 'claimed' },
          { kind: 'quest', key: 'weekly', period: yKey, value: 9, state: 'claimed' },
        ],
      });

      // cycleDay() is the sheet's AND the Home card's day source.
      assert(D.cycleDay(G) === 3, 'cycleDay must follow the server claim streak (3), got ' + D.cycleDay(G));
      // The reward preview must be the Day-3 reward the server will pay.
      const want = R.priceDailyLogin(3), rw = D.rewardFor(G);
      assert(!!(want.gems) === !!(rw.gems) && (rw.gems || 0) === (want.gems || 0),
        'rewardFor must preview the Day-3 gems, got ' + JSON.stringify(rw));
      assert((rw.gold || 0) === (want.gold || 0), 'rewardFor must preview the Day-3 gold');

      // And the rendered sheet must say so.
      const existing = document.getElementById('hr-dl-modal'); if (existing) existing.remove();
      D.open();
      const modal = document.getElementById('hr-dl-modal');
      assert(!!modal, 'the sheet must open');
      /* b499: the eyebrow states the CYCLE POSITION, never a "streak" — see
         DAILY-SHEET-5 for why the word may not appear on this sheet at all. */
      assert(/Day 3 of 7/.test(modal.textContent), 'eyebrow must read "Day 3 of 7", got: ' + modal.textContent.slice(0, 80));
      assert(/Claim Day 3/.test(modal.textContent), 'claim button must read "Claim Day 3", got: ' + modal.textContent.slice(0, 120));
      const today = modal.querySelector('.hr-dl-day.today');
      assert(today && /^D3/.test(today.textContent), 'the highlighted tile must be D3, got: ' + (today && today.textContent));
    } finally {
      const el = document.getElementById('hr-dl-modal'); if (el) el.remove();
      D.noteServerStreak(null);                 // do not leak the captured streak
      /* ⚠ snapshotG() does NOT carry G.streak or G.dailyReward, so restoreG
         alone leaked this test's fixtures into the live save (pre-existing —
         DAILY-SHEET-2 has the same hole). Restored by hand, b166's pattern. */
      restoreG(snap);
      if (sStreak === undefined) delete G.streak; else G.streak = sStreak;
      seedPlayStreak(null);
      if (sDR === undefined) delete G.dailyReward; else G.dailyReward = sDR;
    }
  }),

  () => tryRun('DAILY-SHEET-4 (b497): a MISSED day resets the advertised day — the sheet may never promise a day the server will not pay', () => {
    /* LIVE, 2026-08-31, prod, QA account (b497 play-gate):
         G.dailyReward.lastClaimDay = 20260829; Aug 30 went unclaimed; on Aug 31
         the sheet advertised "DAILY REWARD · 3-DAY STREAK / Claim Day 3 · 2,000
         gold · 5 gems" with D3 highlighted — and the SERVER paid Day 1's 500
         gold and NO gems. Nothing was lost; the modal promised 4x what it paid.

       ROOT CAUSE: two different streaks, one name. The payout is priced from
       `deriveLoginStreak` (consecutive days CLAIMED, off the character's own
       daily/login rows). The sheet rendered `state.streak_days` — hr_apply §4c's
       SETTLE streak (consecutive days PLAYED, 2026-08-21-streak-state.sql).
       They agree only while every played day is also a claimed day.

       This test drives BOTH doors, because the bug is reachable through both:
       the server-row path (a played-but-unclaimed day) and the pre-envelope
       fallback (the residue play-streak, which is not a claim history at all).
       Each RED case is paired with a CONTROL that fails if the fix degenerated
       into "always answer Day 1". */
    const D = window.HearthriseDaily, G = window.G, R = window.HearthriseRewards;
    const B = window.HearthriseCore && window.HearthriseCore.botd;
    assert(D && R && B, 'HearthriseDaily / HearthriseRewards / HearthriseCore.botd must be present');
    const snap = snapshotG();
    const sStreak = G.streak, sDR = G.dailyReward;
    const dayLocal = (ms) => { const d = new Date(ms); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
    const openSheet = () => {
      const old = document.getElementById('hr-dl-modal'); if (old) old.remove();
      D.open();
      return document.getElementById('hr-dl-modal');
    };
    try {
      const now = Date.now();
      const dayN = B.utcDayNumber(now);
      const yKey = B.utcDayKey((dayN - 1) * 86400000);      // yesterday, server spelling
      const y2Key = B.utcDayKey((dayN - 2) * 86400000);     // the day before that
      const y2Local = dayLocal(now - 2 * 86400000);
      const yLocal = dayLocal(now - 86400000);
      const day1 = R.priceDailyLogin(1), day3 = R.priceDailyLogin(3);
      assert(day1.gold !== day3.gold && (day3.gems || 0) !== (day1.gems || 0),
        'CONTROL: Day 1 and Day 3 pay the same, so every assertion below is vacuous');

      // ── (A) THE LIVE CASE. Claimed two days ago, NOTHING for yesterday. ────
      seedPlayStreak(3);                              // the play streak kept running
      G.dailyReward = { lastClaimDay: y2Local };
      D.noteServerStreak({
        now: new Date(now).toISOString(),
        // The exact field b475 read, carrying the exact number it read live.
        state: { streak_days: 3 },
        progress: [{ kind: 'daily', key: 'login', period: y2Key, value: 2, state: 'claimed' }],
      });
      assert(D.cycleDay(G) === 1,
        'THE BUG: a missed day must reset the advertised day to 1, got Day ' + D.cycleDay(G)
        + ' — the sheet is promising a day the server will price at 1');
      const rwA = D.rewardFor(G);
      assert((rwA.gold || 0) === day1.gold,
        'THE BUG: the advertised gold is ' + rwA.gold + ', the server will pay ' + day1.gold);
      assert(!rwA.gems,
        'THE BUG: the sheet advertised ' + rwA.gems + ' gems on a broken streak; Day 1 pays none');
      const mA = openSheet();
      assert(!!mA, 'the sheet must open');
      /* b499: the eyebrow no longer says "streak" at all — it says the CYCLE
         POSITION, which is the quantity this sheet actually owns. */
      assert(/Day 1 of 7/.test(mA.textContent),
        'eyebrow must read "Day 1 of 7", got: ' + mA.textContent.slice(0, 80));
      assert(/Claim Day 1/.test(mA.textContent),
        'claim button must read "Claim Day 1", got: ' + mA.textContent.slice(0, 120));
      const tileA = mA.querySelector('.hr-dl-day.today');
      assert(tileA && /^D1/.test(tileA.textContent),
        'the highlighted tile must be D1, got: ' + (tileA && tileA.textContent));
      mA.remove();

      // ── (B) CONTROL. Same shape, but yesterday IS claimed → the day advances.
      D.noteServerStreak({
        now: new Date(now).toISOString(),
        state: { streak_days: 3 },
        progress: [{ kind: 'daily', key: 'login', period: yKey, value: 2, state: 'claimed' }],
      });
      assert(D.cycleDay(G) === 3,
        'CONTROL: an unbroken streak must still advance to Day 3, got Day ' + D.cycleDay(G)
        + ' — the fix has degenerated into "always Day 1"');
      assert((D.rewardFor(G).gems || 0) === (day3.gems || 0),
        'CONTROL: an unbroken streak must still preview the Day-3 gems');

      // ── (C) CONTROL. A row for yesterday that was never CLAIMED is a break.
      D.noteServerStreak({
        now: new Date(now).toISOString(),
        progress: [{ kind: 'daily', key: 'login', period: yKey, value: 2, state: 'done' }],
      });
      assert(D.cycleDay(G) === 1,
        'a yesterday row in state "done" is not a claim — the server prices that at Day 1, got Day '
        + D.cycleDay(G));

      // ── (D) THE PRE-ENVELOPE FALLBACK, same bug through the other door. ────
      /* Before the first envelope lands (boot, or a client-authoritative build)
         the sheet has only the residue — and `G.streak.count` is the PLAY streak.
         The same reset rule must apply to the only claim history it holds. */
      D.noteServerStreak(null);
      seedPlayStreak(3);
      G.dailyReward = { lastClaimDay: y2Local };
      assert(D.cycleDay(G) === 1,
        'THE BUG, pre-envelope: lastClaimDay two days ago must advertise Day 1, got Day '
        + D.cycleDay(G));
      assert(!D.rewardFor(G).gems, 'THE BUG, pre-envelope: a broken streak advertised gems');

      // CONTROL: claimed yesterday → the residue's day is preserved.
      G.dailyReward = { lastClaimDay: yLocal };
      assert(D.cycleDay(G) === 3,
        'CONTROL: claimed yesterday must still advertise Day 3, got Day ' + D.cycleDay(G));

      /* CONTROL: lastClaimDay 0 is the ABSENCE of a claim history, not a gap.
         Reading it as a break would be acting without certainty in the other
         direction — and it is the state every fresh character boots in. */
      G.dailyReward = { lastClaimDay: 0 };
      assert(D.cycleDay(G) === 3,
        'CONTROL: an empty claim history must not be read as a broken streak, got Day '
        + D.cycleDay(G));

      // ── (E) A STALE CAPTURE MUST NOT ANSWER FOR TODAY. ────────────────────
      /* The rows we hold describe the day the envelope was built for. A capture
         from three days ago says nothing about now; answering from it anyway is
         how a wrong clock becomes a wrong promise. */
      G.dailyReward = { lastClaimDay: y2Local };
      seedPlayStreak(3);
      D.noteServerStreak({
        now: new Date(now - 3 * 86400000).toISOString(),
        progress: [{ kind: 'daily', key: 'login', period: B.utcDayKey((dayN - 4) * 86400000), value: 6, state: 'claimed' }],
      });
      assert(D.cycleDay(G) === 1,
        'a three-day-old envelope must not price today — the local rule (missed day) must answer, got Day '
        + D.cycleDay(G));
    } finally {
      const el = document.getElementById('hr-dl-modal'); if (el) el.remove();
      D.noteServerStreak(null);
      restoreG(snap);
      if (sStreak === undefined) delete G.streak; else G.streak = sStreak;
      seedPlayStreak(null);
      if (sDR === undefined) delete G.dailyReward; else G.dailyReward = sDR;
    }
  }),

  () => tryRun('DAILY-SHEET-5 (b499): TWO true streaks may not share one word — the reward sheet owns "Day", the play streak owns "running"', () => {
    /* THE DEFECT THIS PINS, MEASURED on b498 in a headless boot of the real
       client (play streak 3, last claim two days ago, i.e. a missed day):

         topbar chip           "3"   title="Daily login streak"
         welcome-back modal    "Daily streak            3 days"
         Home card             "Daily reward · Day 1"
         daily-reward sheet    "DAILY REWARD · 1-DAY STREAK / Claim Day 1"

       Every number was CORRECT. b498 fixed the arithmetic; the naming was left,
       so the player reads a 3 and a 1 for two things both called a streak inside
       ten seconds and concludes the game lost their progress. That is the same
       trust failure as an actual mis-payment, at a fraction of the cause.

       THE RULE, and it is a rule about VOCABULARY rather than about a string:
         · The daily-reward sheet describes a CYCLE POSITION. It may say "Day n
           of N"; it may NOT say "streak" — the word is what invites the reader
           to compare it against the flame chip.
         · Every PLAY-streak surface says played / running / in a row, and never
           "daily" (which belongs to the reward) and never a bare "streak"
           (which is ambiguous the moment two exist).

       WHY A TEXT ASSERTION IS THE RIGHT INSTRUMENT HERE. The quantities are
       already guarded by DAILY-SHEET-3/4; what has never been guarded is that
       the two quantities are DISTINGUISHABLE ON SCREEN, and that is a property
       of the rendered words and of nothing else.

       MUTATION (any one of these turns it RED):
         · restore "-day streak" in the sheet's eyebrow (daily-reward.js);
         · restore 'Daily streak' on the welcome row (legacy.js);
         · restore 'Day streak' in the welcome-v2 stat (legacy.js);
         · restore title="Daily login streak" on .streak-badge (index.html). */
    const D = window.HearthriseDaily, G = window.G;
    const B = window.HearthriseCore && window.HearthriseCore.botd;
    assert(D && B, 'HearthriseDaily / HearthriseCore.botd must be present');
    const snap = snapshotG();
    const sStreak = G.streak, sDR = G.dailyReward;
    const dayLocal = (ms) => { const d = new Date(ms); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
    try {
      /* THE EXACT DIVERGENCE. Played three days running, claimed two days ago —
         so the play streak is 3 and the claim cycle is back at Day 1. */
      D.noteServerStreak(null);
      seedPlayStreak(3);
      G.dailyReward = { lastClaimDay: dayLocal(Date.now() - 2 * 86400000) };
      assert(D.cycleDay(G) === 1,
        'CONTROL: this fixture must actually diverge (play 3 / claim Day 1), got Day ' + D.cycleDay(G));

      // ── 1. THE SHEET. Names its cycle position; owns no streak word. ───────
      const old = document.getElementById('hr-dl-modal'); if (old) old.remove();
      D.open();
      const sheet = document.getElementById('hr-dl-modal');
      assert(!!sheet, 'the sheet must open');
      const sheetText = sheet.textContent || '';
      assert(!/streak/i.test(sheetText),
        'the daily-reward sheet must not use the word "streak" — it describes a cycle position, and the '
        + 'word is what makes a player compare it against the flame chip. Got: ' + sheetText.slice(0, 120));
      assert(/Day 1 of 7/.test(sheetText),
        'the sheet must state the cycle position as "Day n of N", got: ' + sheetText.slice(0, 120));
      sheet.remove();

      // ── 2. THE TOPBAR CHIP. Same number as the modal, and it must say which. ─
      const chip = document.querySelector('.streak-badge');
      assert(!!chip, '.streak-badge must exist — it is the play streak\'s only always-on surface');
      const chipTitle = chip.getAttribute('title') || '';
      assert(!/daily/i.test(chipTitle),
        'the flame chip must not call itself "daily" — "daily" belongs to the reward, and this chip '
        + 'counts days PLAYED. Got title: ' + JSON.stringify(chipTitle));
      assert(/played|running|in a row/i.test(chipTitle),
        'the flame chip must say what it counts (played / running / in a row), got: ' + JSON.stringify(chipTitle));

      // ── 3. THE WELCOME-BACK MODAL — the one players actually get (b341). ───
      assert(typeof window.__maybeShowWelcome === 'function',
        '__maybeShowWelcome (the b341 seam) must exist — it is the modal the boot really shows');
      const prevSeen = G.lastSeen, prevWel = G.lastWelcome;
      G.lastSeen = Date.now() - 8 * 3600e3;
      G.lastWelcome = 0;
      window.__maybeShowWelcome();
      const ov = document.getElementById('welcome-overlay');
      assert(!!ov, 'the welcome-back overlay must build');
      const wbText = ov.textContent || '';
      assert(/3/.test(wbText), 'CONTROL: the modal must actually be showing the play streak (3)');
      assert(!/daily streak/i.test(wbText),
        'the welcome-back modal must not label the PLAY streak "Daily streak" — that is the reward\'s '
        + 'word and the two numbers differ. Got: ' + wbText.replace(/\s+/g, ' ').slice(0, 160));
      assert(/running|played|in a row/i.test(wbText),
        'the welcome-back modal must name the play streak in play language, got: '
        + wbText.replace(/\s+/g, ' ').slice(0, 160));
      ov.classList.remove('show');
      G.lastSeen = prevSeen; G.lastWelcome = prevWel;

      /* ── 4. THE SECOND MODAL THAT USED TO SAY IT TOO ─────────────────
         welcome-v2 carried its own copy of this row and therefore its own copy
         of the streak-label collision. It is RETIRED (Set the Night, slate
         §3 — "v2 retires, b341 survives"), so the strongest form of "it does
         not repeat the label" is that it does not exist. NIGHT-4 owns the
         deletion property; this line keeps the streak suite honest about why
         it is only checking one modal now. */
      assert(!('_renderWelcomeV2' in window),
        'welcome-v2 is back, and with it a second surface that can disagree with the reward sheet '
        + 'about what a "streak" is. See NIGHT-4.');

      // ── 5. THE ACHIEVEMENTS that read streak.count must not say "login". ───
      const ACH = window.ACHIEVEMENTS || (window.__LEGACY_INLINE || {}).ACHIEVEMENTS || [];
      const playAch = ACH.filter((a) => a && a.src === 'streak.count');
      assert(playAch.length >= 2, 'CONTROL: the play-streak achievements must still exist, got ' + playAch.length);
      playAch.forEach((a) => {
        assert(!/login/i.test(a.desc || ''),
          'achievement "' + a.id + '" counts the PLAY streak but its description says "login streak", '
          + 'which points the player at the reward cycle instead: ' + JSON.stringify(a.desc));
      });

      /* ── 6. RENOWN'S OWN LABEL for the same quantity. `streakBest` reads
         `player_state.streak_days` — the SERVER play streak — and calling it a
         "login streak" points the reader at the reward cycle, which pays a
         different thing off a different counter. This is the surface that made
         the collision expensive rather than merely confusing: renown is the
         "Rise to the Throne" spine, so a player who chases the wrong number
         chases it for weeks. */
      const RN = window.HearthriseRenown;
      if (RN && RN.WEIGHT_LABELS) {
        const lbl = RN.WEIGHT_LABELS.streakBest || '';
        assert(!/login/i.test(lbl),
          'renown WEIGHT_LABELS.streakBest scores the PLAY streak; it may not call it a "login '
          + 'streak" (that is the daily reward\'s number). Got: ' + JSON.stringify(lbl));
        assert(/play|running|in a row/i.test(lbl),
          'renown WEIGHT_LABELS.streakBest must name what it counts, got: ' + JSON.stringify(lbl));
      }

      /* ── 7. THE THIRD STREAK. Lifetime Stats carries a KILL streak, and an
         unqualified "Current streak" on a stats screen is read against the
         topbar flame. Every streak in the game must be qualified by what it
         counts — that is the whole rule, applied to the surface that has no
         daily/claim involvement at all. */
      assert(typeof window.openLifetimeStats === 'function',
        'openLifetimeStats must be on window (it is the only door to the Lifetime Stats copy)');
      window.openLifetimeStats();
      const ls = document.getElementById('lifetime-stats');
      assert(!!ls, 'the Lifetime Stats modal must build');
      const lsText = ls.textContent || '';
      assert(/kill streak/i.test(lsText),
        'CONTROL: Lifetime Stats must actually be rendering a kill-streak row');
      assert(!/(^|[^a-z])Current streak([^a-z]|$)/i.test(lsText),
        'Lifetime Stats renders a bare "Current streak" — qualify it ("Current kill streak"). '
        + 'Three quantities in this game are called a streak; an unqualified one on a stats screen '
        + 'is read against the topbar flame, which counts something else.');
      ls.classList.remove('show');
    } finally {
      const el = document.getElementById('hr-dl-modal'); if (el) el.remove();
      const ov = document.getElementById('welcome-overlay'); if (ov) ov.classList.remove('show');
      D.noteServerStreak(null);
      restoreG(snap);
      if (sStreak === undefined) delete G.streak; else G.streak = sStreak;
      seedPlayStreak(null);
      if (sDR === undefined) delete G.dailyReward; else G.dailyReward = sDR;
    }
  }),

  /* -- regression suite -- RESIDUE-PURGE: THE SERVER'S COPY WINS, FIELD BY FIELD
     Nine residue fields were SECOND COPIES of values hr_state_of already
     projects, and each had been measured saying something the server denied: the
     flame chip on 1 against `streak_days` 3; the panel promising 50% auto-eat
     against `auto_eat_pct` 25; the HUD naming cooked_shrimp against
     `auto_eat_food` turnip; 1193 Renown against `renown_high` 1058. They are
     deleted, not "preferred second".
     THE CONTRACT, split three ways below: seed the STALE residue value AND hand
     the real reader a server envelope, then assert the reader answers the SERVER.
     Driving the shipped reconciles and readers, not a copy of them.
     MUTATION (proven per block): restore the deleted residue read — give
     playStreakDays its `G.streak.count` fallback back, or let ownsGemUnlock fall
     through to `G.ownedThemes` — and that block goes RED. */
  () => tryRun('RESIDUE-PURGE-1: stale PROGRESS copies never outrank the envelope', () => {
    const A = window.HearthriseAccrual, G = window.G;
    assert(A && typeof A.reconcilePlayStreak === 'function', 'accrue.js must export the reconciles');
    const snap = residuePurgeSnap(G);
    try {
      /* THE PLAY STREAK: device counter 1, column 3. */
      G.streak = { count: 1, lastDay: 20260914 };
      A.reconcilePlayStreak(G, { ok: true, state: { streak_days: 3, streak_day_key: '2026-09-14' } });
      assert(A.playStreakDays(G) === 3,
        'THE BUG: the play streak read ' + A.playStreakDays(G) + ' with a residue 1 and a server 3');
      assert(window.HearthriseStreakChip.days(G) === 3, 'the flame chip must paint the server count');
      assert(typeof window.HearthriseStreakChip.advance !== 'function',
        'the device-clock streak counter is deleted — a local advance() is a second counter and a faucet');

      /* THE FRACTIONAL TOOL CARRY: local 0.9, column 0.25. */
      G.toolCarry = { mining: 0.9 };
      A.reconcileToolCarry(G, { ok: true, state: { tool_carry: { mining: 0.25 } } });
      assert(G.toolCarry.mining === 0.25,
        'THE BUG: the tool carry stayed on the prediction (' + G.toolCarry.mining + ') against a server 0.25');

      /* THE COMBAT STYLE: the routing a settle pays XP into. */
      G.combatStyle = { sword: 'accurate' };
      A.reconcileCombatStyle(G, { ok: true, state: { combat_style: { sword: 'aggressive' } } });
      assert(G.combatStyle.sword === 'aggressive',
        'THE BUG: the picker kept a local style (' + G.combatStyle.sword + ') the engine does not pay');

      /* RENOWN: the number that hands out perks. */
      G.renownHigh = 9999;
      window.HearthriseRenown.noteServerRenown({ ok: true, renown_high: 1058 });
      assert(window.HearthriseRenown.counted(G) === 1058,
        'THE BUG: the counted renown is ' + window.HearthriseRenown.counted(G) + ', not the realm 1058');
    } finally { residuePurgeRestore(G, snap); }
  }),

  () => tryRun('RESIDUE-PURGE-2: a forged ENTITLEMENT in the bag confers nothing', () => {
    const A = window.HearthriseAccrual, G = window.G;
    const snap = residuePurgeSnap(G);
    try {
      /* A FORGED residue claims a 1,000-gem theme and a 1,200-gem cosmetic; the
         server's set carries only the free row. */
      G.ownedThemes = ['default', 'volcanic'];
      G.ownedCosmetics = ['pet_phoenix'];
      A.reconcileGemUnlocks(G, { ok: true, gem_unlocks: ['theme:default'] });
      assert(window.ownsGemUnlock('theme', 'volcanic') === false,
        'THE BUG: a residue entry still confers a gem-priced theme the server never sold');
      assert(window.ownsGemUnlock('cosmetic', 'pet_phoenix') === false,
        'THE BUG: a residue entry still confers a gem-priced cosmetic the server never sold');
      assert(window.ownsGemUnlock('theme', 'default') === true,
        'the FREE theme must stay owned — the catalogue gives it away and the projection carries it');

      /* HERO SLOTS: residue says five, the account owns one. */
      G.heroSlotsUnlocked = 5;
      A.reconcileHeroSlots(G, { ok: true, hero_slots: [0] });
      assert(window.HearthriseProfile.ownsSlot(3) === false,
        'THE BUG: the residue still lists a hero slot the realm will refuse with slot_not_owned');
    } finally { residuePurgeRestore(G, snap); }
  }),

  () => tryRun('RESIDUE-PURGE-3: the auto-eat triple is the server\'s, and none of the nine rides the save', () => {
    const A = window.HearthriseAccrual, G = window.G;
    const snap = residuePurgeSnap(G);
    const wasParked = (window.HearthriseAuto && window.HearthriseAuto._parkAutoEatMirror)
      ? window.HearthriseAuto._parkAutoEatMirror(false) : false;
    try {
      /* THRESHOLD, PROVISION AND SWITCH — the three columns the accrual engine
         prices every night with. */
      G.autoEatPct = 0.5; G.foodSlot = 'cooked_shrimp';
      A.noteServerAutoEat({ ok: true, state: { auto_eat_pct: 25, auto_eat_food: 'turnip', auto_eat_enabled: false } });
      const th = window.HearthriseAuto.eatThreshold();
      assert(Math.abs(th - 0.25) < 1e-9,
        'THE BUG: the threshold read ' + th + ' with a local 0.5 and a server 25%');
      assert(window.autoEatFoodId() === 'turnip',
        'THE BUG: the forecast named ' + window.autoEatFoodId() + ' while the engine eats the server turnip');
      assert(window.HearthriseAuto.eatEnabled() === false,
        'THE BUG: the panel says auto-eat is ON while `auto_eat_enabled` is false — the night eats nothing');

      /* AND NONE OF THEM RIDES THE SAVE. The patch is what the residue PUT ships;
         a purged name in it is the field coming back through the back door, and
         `autoActions.eat` is the same three columns one level down. */
      G.streak = { count: 1 }; G.toolCarry = { mining: 0.9 }; G.combatStyle = { sword: 'accurate' };
      G.ownedThemes = ['volcanic']; G.ownedCosmetics = ['pet_phoenix'];
      G.heroSlotsUnlocked = 5; G.renownHigh = 9999;
      G.autoActions = { eat: { enabled: true, threshold: 0.5, foodId: 'cooked_shrimp' },
        farmReplant: { enabled: true, cropId: 'carrot' } };
      const patch = window.HearthriseCapstone.buildResiduePatch(G);
      ['streak', 'toolCarry', 'combatStyle', 'ownedThemes', 'ownedCosmetics',
        'heroSlotsUnlocked', 'autoEatPct', 'foodSlot', 'renownHigh'].forEach((f) =>
        assert(!Object.prototype.hasOwnProperty.call(patch, f),
          'the residue patch still ships `' + f + '` — the purged copy is being persisted after all'));
      assert(patch.autoActions && !patch.autoActions.eat,
        'the residue patch still ships `autoActions.eat` — those three keys ARE auto_eat_enabled/pct/food');
      assert(patch.autoActions && patch.autoActions.farmReplant
        && patch.autoActions.farmReplant.cropId === 'carrot',
        'CONTROL: the genuinely client-only auto-action prefs must still ride');
    } finally {
      if (window.HearthriseAuto && window.HearthriseAuto._parkAutoEatMirror) {
        window.HearthriseAuto._parkAutoEatMirror(wasParked);
      }
      try { A.__resetServerAutoEat(); } catch (e) {}
      residuePurgeRestore(G, snap);
    }
  }),

  () => tryRun('RESIDUE-B466: the bestiary (and the sweep\'s other 15 strands) survive the residue round-trip', () => {
    /* PLAYER REPORT (paione, live open beta): "Bestiary achievements keep
       resetting every time you log out and in."

       CLASS, not bug. Under BLOB_RETIRED persistence inverted from a DENYLIST
       (everything survives unless excluded) to an ALLOWLIST (only a homed field
       survives). `G.bestiary` was written by the game and homed by nothing, so
       every reload started the kill record from zero — and a mechanical sweep of
       every `G.<field>` write found EIGHTEEN more unhomed fields, fourteen of
       them the same silent reset, including `G.raids` (weekly claim markers,
       i.e. a faucet when forgotten) and `G.homestead` (a paid tier the boot
       would silently re-derive downwards).

       This drives the REAL save path — buildResiduePatch (what the save loop
       ships to hr_put_client_state) into hydrateInto (what the load path writes
       into G) — on a caller-supplied object, so it neither depends on nor
       disturbs the session's own once-per-session hydrate latch.

       MUTATION: remove 'bestiary' from RESIDUE_FIELDS in src/net/client-state.js
       → RED (the patch drops it and the reload reads undefined). */
    const CS = window.HearthriseClientState, CAP = window.HearthriseCapstone;
    assert(CS && typeof CS.hydrateInto === 'function', 'hydrateInto must be exported for the round-trip');
    assert(CAP && typeof CAP.buildResiduePatch === 'function', 'buildResiduePatch must be exported');
    const RF = CAP.RESIDUE_FIELDS;
    assert(Array.isArray(RF), 'RESIDUE_FIELDS must be exported');
    /* The whole sweep, named — so deleting any one of them fails here rather
       than in a player's inbox six weeks later. */
    /* ⚠ `wieldGrandfather` was the sixteenth name here and is DELETED, not re-homed:
       every other field is self-only PROGRESS, that one was a client-held GEAR
       PERMISSION the realm never mirrored. Re-adding it re-opens §6 with a save. */
    ['bestiary', 'dropLog', 'collectionLog', 'lifetimeKills', 'homestead',
      'currentCombatTier', 'buyback', 'dailyGoldStart', 'raids',
      'muster', 'rallyPledge', 'pendingItemSpends'].forEach((f) =>
      assert(RF.indexOf(f) >= 0, 'THE BUG: G.' + f + ' must be a residue field or every reload forgets it'));
    /* ⚠ `renownHigh` and `toolCarry` LEFT THIS LIST on 2026-09-14 and must NOT
       come back: both were second copies of a value hr_state_of projects
       (`renown_high`; `state.tool_carry`). renownHigh is now the in-session
       prediction ratchet (NO_SYNC) and toolCarry is mirrored by
       accrue.js reconcileToolCarry. See RESIDUE-PURGE-1 below. */
    ['renownHigh', 'toolCarry', 'ownedThemes', 'ownedCosmetics', 'autoEatPct',
      'foodSlot', 'streak', 'combatStyle', 'heroSlotsUnlocked'].forEach((f) =>
      assert(RF.indexOf(f) < 0, f + ' is back on RESIDUE_FIELDS — it is a client copy of a value the '
        + 'server projects, which is exactly what the 2026-09-14 purge deleted'));
    /* `collection` (items found) and `collectionLog` (milestones claimed) are two
       different stores, not an alias pair — both must be homed. */
    assert(RF.indexOf('collection') >= 0 && RF.indexOf('collectionLog') >= 0,
      'collection and collectionLog are distinct stores; both must persist');
    /* The other half of the sweep: declared scratch must NOT also be residue. */
    ['combatKillsThisFoe', 'viewingSkill', 'lastSessionSummary'].forEach((f) =>
      assert(RF.indexOf(f) < 0, f + ' is declared in-flight scratch (NO_SYNC) — it must not also be residue'));
    /* AND the ruling on `traits`: it belongs to the SERVER (reconcileTraits mirrors
       hr_state_of's projection of the rows hr_trait_buy writes), so it must NOT
       be duplicated into the self-only bag — one paid entitlement, one source. */
    assert(RF.indexOf('traits') < 0,
      'traits is server-homed (reconcileTraits) — putting it in the residue bag gives a paid entitlement two sources');
    assert(window.HearthriseAccrual && typeof window.HearthriseAccrual.reconcileTraits === 'function',
      'traits is homed by reconcileTraits — if that export is gone, traits is stranded and must be re-homed');

    const G = window.G;
    const keep = {};
    const touched = ['bestiary', 'traits', 'toolCarry', 'raids'];
    touched.forEach((f) => { keep[f] = G[f]; });
    try {
      G.bestiary = { goblin: { kills: 5, firstKill: 1700000000000 } };
      G.toolCarry = { woodcutting: 0.75 };
      G.raids = { lastStrikeDay: '2026-08-24', solo: { week: 9, damage: 400, strikes: 2 }, claimed: { '9': true } };

      // SAVE: what the client ships to client_state
      const patch = window.HearthriseCapstone.buildResiduePatch(G);
      assert(patch && patch.bestiary && patch.bestiary.goblin && patch.bestiary.goblin.kills === 5,
        'THE BUG: buildResiduePatch dropped the bestiary — it never reaches the server, so a reload cannot restore it');
      assert(typeof patch.traits === 'undefined',
        'traits must NOT ride the self-only bag — it is server-homed (reconcileTraits)');

      // LOAD: what the server bag writes back into a fresh G on the next boot
      const reloaded = {};
      window.HearthriseClientState.hydrateInto(reloaded, JSON.parse(JSON.stringify(patch)));
      assert(reloaded.bestiary && reloaded.bestiary.goblin && reloaded.bestiary.goblin.kills === 5,
        'THE BUG: the bestiary did not survive the reload round-trip');
      assert(reloaded.bestiary.goblin.firstKill === 1700000000000, 'the first-kill stamp was lost');
      /* THE OTHER HOME, driven end to end: a reloaded G has no traits at all
         until the envelope re-supplies them — that is the mechanism, and it must
         actually work, or "not residue" would just be a different way to lose a
         Marks purchase. */
      assert(typeof reloaded.traits === 'undefined', 'fixture: the bag must not carry traits');
      window.HearthriseAccrual.reconcileTraits(reloaded, { traits: ['auto_eat', 'keen_eye'] });
      assert(reloaded.traits && reloaded.traits.auto_eat === true && reloaded.traits.keen_eye === true,
        'THE BUG: the server\'s trait rows did not restore G.traits — a Marks purchase would be re-charged');
      /* ⚠ `toolCarry` LEFT THIS ROUND-TRIP on 2026-09-14: it is `state.tool_carry`
         and is restored by accrue.js reconcileToolCarry (AWAY-11 drives that end to
         end). What must hold HERE is that the bag no longer carries it at all. */
      assert(typeof reloaded.toolCarry === 'undefined',
        'the residue round-trip still carries toolCarry — the server column is the one copy');
      assert(reloaded.raids && reloaded.raids.claimed && reloaded.raids.claimed['9'] === true,
        'the weekly raid claim marker was lost — a reload would re-open a claimed reward');

      /* THE BAG HAS A HARD CEILING. hr_put_client_state refuses the whole patch
         over 256 KiB (state_too_large) — and a refused patch means EVERY residue
         field stops saving, not just the big one. The sweep just added the two
         per-monster logs (bestiary, dropLog) next to `collection` and
         `chronicle`, so the ceiling stopped being theoretical. Measured on the
         live G with a wide margin: this is a smoke alarm for a future field that
         grows without bound (a per-kill array, a full combat log), not a
         tight bound on today's data. */
      const bytes = JSON.stringify(patch).length;
      assert(bytes < 131072, 'the residue patch is ' + bytes + ' bytes — over half the 256 KiB client_state cap. '
        + 'A field on RESIDUE_FIELDS is growing without bound; at the cap the server refuses the patch and NOTHING '
        + 'in the residue saves for anyone.');

      /* THE SECURITY BOUNDARY, unchanged by the new names: the bag is
         client-writable, so an AUTHORITY key in it must never reach G. */
      const forged = {};
      window.HearthriseClientState.hydrateInto(forged, Object.assign({ gold: 1e12, skills: { attack: 99 } }, patch));
      assert(typeof forged.gold === 'undefined' && typeof forged.skills === 'undefined',
        'hydrateInto splatted a forged AUTHORITY key from the bag — the allowlist is broken');
    } finally {
      touched.forEach((f) => { if (typeof keep[f] === 'undefined') delete G[f]; else G[f] = keep[f]; });
    }
  }),

  () => tryRunAsync('DAILY-SHEET-1 (b462): the daily-reward "shown today" marker rides the residue, and a server refusal never toasts a payout', async () => {
    /* Beta morning: "every refresh i get a new daily reward". G.dailyReward.lastClaimDay
       lived only in the retired blob, so every reload forgot it and re-opened the
       sheet; the server refused the second pay (not_claimable) but the client still
       toasted "Daily reward: 500 gold". Two halves: (1) the four shown-today markers
       are RESIDUE fields (persisted in client_state under arm); (2) a `refused`
       verdict re-marks the day and says so, instead of claiming a payout. */
    const RF = window.HearthriseCapstone && window.HearthriseCapstone.RESIDUE_FIELDS;
    assert(Array.isArray(RF), 'RESIDUE_FIELDS must be exported');
    /* ⚠ `streak` LEFT THIS LIST on 2026-09-14: the play streak is the server's
       `streak_days` (reconcilePlayStreak → playStreakDays), and a device-clock
       copy in the bag is what painted 1 over the realm's 3. The other three are
       genuine shown-today markers with no projection behind them. */
    ['dailyReward', 'dailyGoals', 'weeklyGoals'].forEach((f) =>
      assert(RF.includes(f), 'THE BUG: ' + f + ' must be a residue field or every reload forgets it'));
    assert(!RF.includes('streak'),
      'the play-streak residue is back — the day the sheet shows must come from the server, not a device clock');
    const G = window.G;
    const snap = snapshotG();
    const origGold = window.HearthriseGold, origNotify = window.notify, origMay = window.clientMayWriteRecordField;
    const toasts = [];
    try {
      window.clientMayWriteRecordField = (f) => f !== 'gold';
      window.notify = (m) => { toasts.push(String(m)); };
      G.dailyReward = { lastClaimDay: 0 };
      const patch = window.HearthriseCapstone.buildResiduePatch(G);
      assert(patch && patch.dailyReward && patch.dailyReward.lastClaimDay === 0,
        'buildResiduePatch must carry dailyReward so the marker reaches client_state');
      // server says: already claimed today (another device / a reload race)
      window.HearthriseGold = Object.assign({}, origGold, {
        claimReward: () => Promise.resolve({ outcome: 'refused', reason: 'not_claimable' }),
      });
      const D = window.HearthriseDaily;
      assert(D && D.isClaimable(G) === true, 'fixture: the day must read claimable before the claim');
      const rw = D.claim(G);
      assert(rw, 'claim() still returns the authored reward as the PREDICTION receipt');
      await new Promise((r) => setTimeout(r, 0));
      assert(D.isClaimable(G) === false, 'after a refusal the day must read claimed (no second sheet)');
      assert(toasts.some((t) => /already claimed/i.test(t)), 'a refusal must be surfaced honestly');
      assert(!toasts.some((t) => /^Daily reward:/.test(t)), 'a refusal must NOT toast a payout');
    } finally {
      window.HearthriseGold = origGold; window.notify = origNotify; window.clientMayWriteRecordField = origMay;
      restoreG(snap);
    }
  }),

  () => tryRun('b371: the slot purchase repaints the gem chip and persists the spend immediately', () => withClientOwnedSlots(() => withLocalBlob(() => {
    /* ⚠ b456 — DRIVEN WITH THE BLOB LIVE, AND THE REASON IS A REAL SHIPPED BUG,
       NOT A HARNESS GAP. `unlockSlot` proves durability by calling saveLocal()
       and READING THE BLOB BACK (multi-character.js): if the readback does not
       show both the gem debit and the entitlement it rolls the purchase back.
       The b455 capstone retires the blob, so saveLocal writes nothing, the
       readback is null, and EVERY hero-slot purchase now fails with "Couldn't
       save your purchase, so nothing was charged." Measured live in this build.
       Filed as a P1 for the Systems Engineer (SLOT-BUY-1 below is the red guard
       that states it). Nothing is charged, so it is a hard block rather than a
       loss — but a premium-currency purchase is dead.
       These two tests are about the PURCHASE MECHANICS (the chip repaint, the
       atomic revert), which are unchanged and still ship, so they run in the
       position where a purchase can complete. */
    const HP = window.HearthriseProfile;
    if (!HP || !HP.profile) return;
    const next = HP.canUnlockNext();
    if (!next || next.free) return;                 // only a real gem spend proves this
    const G = window.G;
    const prevGems = G.gems;
    const prevProfile = JSON.parse(JSON.stringify(HP.profile));
    const chip = document.getElementById('top-gems');
    try {
      G.gems = next.cost + 1000;
      stampBalanceLikeLoad(G);   // armed: the starting balance is KNOWN the way hr_load leaves it before render
      window.updateTopbar();
      const before = chip ? chip.textContent : '';
      const hadDigits = /\d/.test(before);
      const r = HP.unlockSlot(next.slotId);
      assert(r && r.ok, 'unlockSlot must succeed when the player can afford it: ' + (r && r.reason));
      assert(G.gems === 1000, 'the gems were not actually spent');
      if (chip && hadDigits) {
        /* gold-arm: gems is a SERVER_OF_RECORD field and unlockSlot is an UNWIRED
           gem sink (raw debit, no server verb → no reconciling envelope), so after
           the spend the balance is UNKNOWN until the next hr_load and the chip
           renders the honest PENDING state. The b371 regression this guards —
           the chip left showing the STALE pre-purchase number — is still caught:
           the chip must REPAINT (pending ≠ the old number). What arming changes is
           that the post-spend chip is pending, not the live figure; asserting the
           live figure here would require faking a reconcile the server never sends. */
        assert(chip.textContent !== before,
          'the header gem chip still shows the pre-purchase balance — the spend never repainted the topbar, so '
          + 'the player sees a stale number until they reload (b371 P2)');
        const B = window.HearthriseBalance;
        const pending = !!(chip.classList && B && chip.classList.contains(B.PENDING_CLASS));
        assert(pending || chip.textContent.replace(/[^0-9]/g, '') === String(G.gems),
          'after an armed gem spend the chip must show either the live balance (reconciled) or the honest '
          + 'PENDING state — never a stale formatted number');
      }
      const raw = localStorage.getItem('hearthbound-save-v2');
      if (raw) {
        const d = JSON.parse(raw);
        assert(d.gems === G.gems,
          'the gem spend was not persisted — a reload before the next autosave refunds the gems and KEEPS the '
          + 'slot, because the profile record is written immediately and the save is not');
      }
    } finally {
      G.gems = prevGems;
      HP.profile = prevProfile;
      try { localStorage.setItem('hearthrise:profile', JSON.stringify(prevProfile)); } catch (e) {}
      try { window.saveLocal(); } catch (e) {}
      try { window.updateTopbar(); } catch (e) {}
      stampRecordLikeLoad(G);
    }
  }))),

  /* ── b371 P1 — THE GEM DUPE ────────────────────────────────────────────
     REPORTED LIVE: a 200-gem purchase of slot 2 debited the gems, a cloud
     restore then handed them back — AND THE SLOT STAYED UNLOCKED. Free slot.
     The cause was two stores with two lifetimes: gems in the save (restorable),
     the unlock in localStorage['hearthrise:profile'] (never uploaded, never
     rolled back). This asserts they are now ONE record, by doing the thing the
     restore does and demanding both halves rewind. */
  () => tryRun('b371: a slot purchase and its gem debit revert TOGETHER on a save restore (no free slot)', () => withClientOwnedSlots(() => withLocalBlob(() => {
    /* ⚠ b456 — DRIVEN WITH THE BLOB LIVE, AND THE REASON IS A REAL SHIPPED BUG,
       NOT A HARNESS GAP. `unlockSlot` proves durability by calling saveLocal()
       and READING THE BLOB BACK (multi-character.js): if the readback does not
       show both the gem debit and the entitlement it rolls the purchase back.
       The b455 capstone retires the blob, so saveLocal writes nothing, the
       readback is null, and EVERY hero-slot purchase now fails with "Couldn't
       save your purchase, so nothing was charged." Measured live in this build.
       Filed as a P1 for the Systems Engineer (SLOT-BUY-1 below is the red guard
       that states it). Nothing is charged, so it is a hard block rather than a
       loss — but a premium-currency purchase is dead.
       These two tests are about the PURCHASE MECHANICS (the chip repaint, the
       atomic revert), which are unchanged and still ship, so they run in the
       position where a purchase can complete. */
    const HP = window.HearthriseProfile, G = window.G;
    if (!HP || !HP.profile) return;
    assert(typeof HP.unlockedCount === 'function',
      'HearthriseProfile.unlockedCount() must be the ONE answer to how many slots are owned');
    const next = HP.canUnlockNext();
    if (!next || next.free) return;                 // only a real gem spend proves this
    const prevGems = G.gems;
    const prevProfile = JSON.parse(JSON.stringify(HP.profile));
    const hadSlots = Object.prototype.hasOwnProperty.call(G, '_heroSlots');
    const prevSlots = G._heroSlots;
    try {
      G.gems = next.cost + 1000;
      stampBalanceLikeLoad(G);   // armed: unlockSlot reads gems via canAfford
      // The cloud snapshot as it stood BEFORE the purchase.
      const older = { gems: G.gems };
      const r = HP.unlockSlot(next.slotId);
      assert(r && r.ok, 'the purchase should succeed here: ' + (r && r.reason));
      assert(G.gems === 1000, 'the gems were not debited');
      assert(HP.unlockedCount() === next.slotId + 1, 'the slot was not unlocked');
      /* ⚠ 2026-09-14 — THE ENTITLEMENT IS NO LONGER IN ANY CLIENT STORE. It used
         to be asserted here as `G.heroSlotsUnlocked` (residue), on the reasoning
         that gems and slot had to rewind together because they were the same
         bytes. hr_buy_hero_slot + the `hero_slots` projection made that obsolete:
         the entitlement is a server row and the residue copy was deleted, so the
         dupe is not "reverted together", it is UNREACHABLE. The purchase path
         writes only the device's own metadata cache. */
      assert(HP.profile.unlockedSlots === next.slotId + 1,
        'the pre-arm purchase must still record the device metadata cache');

      // THE RESTORE. decideRestore replaces the fields the snapshot carries.
      G.gems = older.gems;

      /* AND THE REALM SPEAKS: its set is the authority, so a restored balance
         with a server that never sold the slot leaves the player owning nothing
         — whatever any client store says. THIS is what killed the b371 dupe. */
      window.HearthriseAccrual.reconcileHeroSlots(G, { ok: true, hero_slots: [0] });
      assert(HP.unlockedCount() === 1 && HP.ownsSlot(next.slotId) === false,
        'THE b371 GEM DUPE: the gems came back and the slot stayed unlocked against a server set that '
        + 'does not carry it — the purchase was free');
      /* THE STATEMENT STANDS for the rest of the test: the realm's set is the
         authority on every question below (what is listed, what is buyable, what
         a device-local cache may re-grant). */
      const rows = HP.slotRows();
      assert(!rows.some((row) => row.kind === 'char' && row.id === next.slotId),
        'the reverted slot is still listed as a playable character');
      const nx = HP.canUnlockNext();
      assert(nx && nx.slotId === next.slotId,
        'the reverted slot must be buyable again — the player has their gems back and owns nothing');
      // …and the device-local record may not re-grant what the save took away.
      HP.profile.unlockedSlots = 5;
      assert(HP.unlockedCount() === next.slotId,
        'localStorage["hearthrise:profile"] re-granted the slot — it is a metadata CACHE, not the authority');
      assert(HP.switchSlot(next.slotId) === null,
        'a slot the account no longer owns can still be switched to');
    } finally {
      G.gems = prevGems;
      if (hadSlots) G._heroSlots = prevSlots; else delete G._heroSlots;
      HP.profile = prevProfile;
      try { localStorage.setItem('hearthrise:profile', JSON.stringify(prevProfile)); } catch (e) {}
      try { window.saveLocal(); } catch (e) {}
      try { window.updateTopbar(); } catch (e) {}
      stampRecordLikeLoad(G);
    }
  }))),

  /* ══════════════════════════════════════════════════════════════════════════
     ⚠ SLOT-BUY-1 (b456) — RED ON PURPOSE: A PREMIUM PURCHASE IS DEAD UNDER THE
     SHIPPED CAPSTONE. Report, do not silence.
     ══════════════════════════════════════════════════════════════════════════
     multi-character.js `unlockSlot` earns its atomicity by PROVING the write:
     it calls saveLocal() and reads `hearthbound-save-v2` back, requiring both
     `gems` and `heroSlotsUnlocked` to be in the blob before it hands over the
     entitlement. That proof was exactly right when the blob was the store.

     The b455 capstone retires the blob: saveLocal returns before writing, and
     loadLocal removes any leftover on the way past. So the readback is `null`,
     `durable` is false, and the purchase ROLLS BACK — every time, for everyone.
     MEASURED in this build: `unlockSlot(1)` → {ok:false, reason:"Couldn't save
     your purchase, so nothing was charged."}, gems untouched, slot not granted.

     Nothing is charged, so this is a hard block rather than a gem loss — but a
     200/400/1500-gem premium purchase cannot be completed at all.

     THE FIX IS NOT TO DELETE THE PROOF. The proof is what stopped the b371 dupe
     (entitlement outliving the payment). It has to move to a store that still
     exists under the capstone — the server (a slot-purchase verb) or, at
     minimum, the durable profile/client_state record — so the purchase stays
     atomic-or-nothing. Owner: Systems Engineer.
     ══════════════════════════════════════════════════════════════════════════ */
  () => tryRunAsync('HIRE-OWNED-1 (b463): an already_owned rung is a RECEIPT — the hire proceeds to materialise the paid crew', async () => {
    /* Three live players paid worker_hire.1 during the offers-wipe window, got
       no crew, and every retry died on "Could not complete the hire — already
       owned". The rung being owned means the cap is PAID; the hire must
       proceed to hr_worker_hire, which materialises up to the paid cap. */
    const W = window.HearthriseWorkers, G = window.G;
    const snap = snapshotG();
    const origGold = window.HearthriseGold, origNet = window.HearthriseWorkersNet;
    const origHomestead = window.HearthriseHomestead, origMay = window.clientMayWriteRecordField;
    const origAfford = window.balCanAfford, origSettle = window.goldSettle, origKey = window.goldIntentKey;
    const origNotify = window.notify;
    const toasts = []; let netHired = 0;
    try {
      window.clientMayWriteRecordField = () => false;   // armed
      window.notify = (m) => { toasts.push(String(m)); };
      window.balCanAfford = () => true;
      window.goldSettle = () => {}; window.goldIntentKey = () => 'k-test';
      window.HearthriseHomestead = Object.assign({}, origHomestead, { workerSlots: () => 1 });
      window.HearthriseGold = Object.assign({}, origGold, {
        buyUnlock: () => Promise.resolve({ outcome: 'refused', reason: 'already_owned' }),
      });
      /* HIRE-FIRST: the first hr_worker_hire probes the cap. Force
         crew_cap_reached so the client is driven into the rung-purchase branch,
         where the already_owned RECEIPT must still let the second hire land. */
      let hireN = 0;
      window.HearthriseWorkersNet = Object.assign({}, origNet, {
        isSignedIn: () => true,
        hire: () => {
          if (++hireN === 1) return Promise.resolve({ ok: false, error: 'crew_cap_reached', crew: 0, paid_cap: 0 });
          netHired++; return Promise.resolve({ ok: true, uid: 'srv-1', name: 'Test Hand' });
        },
      });
      G.workers = { hired: [] };
      const w = W.hire();
      assert(w, 'the optimistic worker must be created');
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      assert(netHired === 1, 'THE BUG: an already_owned rung must proceed to hr_worker_hire (the cap is paid)');
      assert(G.workers.hired.length === 1 && G.workers.hired[0].uid === 'srv-1',
        'the crew row must survive and take the server uid');
      assert(!toasts.some((t) => /could not complete/i.test(t)), 'no failure toast on a paid cap');
    } finally {
      window.HearthriseGold = origGold; window.HearthriseWorkersNet = origNet;
      window.HearthriseHomestead = origHomestead; window.clientMayWriteRecordField = origMay;
      window.balCanAfford = origAfford; window.goldSettle = origSettle; window.goldIntentKey = origKey;
      window.notify = origNotify;
      restoreG(snap);
    }
  }),

  () => tryRunAsync('HIRE-STRANDED-1 (2026-08-25): a paid-but-unmaterialised rung heals on the next hire with NO repurchase', async () => {
    /* THE LIVE FAILURE, QA account 0a47ba77, slot 0: worker_hire=1 owned in
       player_progress, player_workers empty, gold unspent. The old code bought
       the rung FIRST, and when the buy came back already_owned in a wire shape
       the client did not classify as `owned`, it dropped the optimistic worker
       and NEVER called hr_worker_hire — so the paid crew was unreachable.
       HIRE-FIRST fix: hr_worker_hire is asked first and materialises against the
       already-paid cap, so buyUnlock is never sent for a stranded/available rung.
       MUTATION: revert workers.js hireServer to buy-then-hire -> buyUnlock is
       called, returns a non-`owned` refusal, the worker is dropped -> RED. */
    const W = window.HearthriseWorkers, G = window.G;
    const snap = snapshotG();
    const origGold = window.HearthriseGold, origNet = window.HearthriseWorkersNet;
    const origHomestead = window.HearthriseHomestead, origMay = window.clientMayWriteRecordField;
    const origAfford = window.balCanAfford, origSettle = window.goldSettle, origKey = window.goldIntentKey;
    const origNotify = window.notify;
    const toasts = []; let netHired = 0, buyCalls = 0;
    try {
      window.clientMayWriteRecordField = () => false;   // armed
      window.notify = (m) => { toasts.push(String(m)); };
      window.balCanAfford = () => true;
      window.goldSettle = () => {}; window.goldIntentKey = () => 'k-test';
      window.HearthriseHomestead = Object.assign({}, origHomestead, { workerSlots: () => 1 });
      /* If the fix regresses, buyUnlock is reached and returns a shape the old
         `owned` check rejects — reproducing the live drop. If the fix holds,
         buyUnlock is never called at all. */
      window.HearthriseGold = Object.assign({}, origGold, {
        buyUnlock: () => { buyCalls++; return Promise.resolve({ outcome: 'refused', reason: 'unlock_buy_failed' }); },
      });
      /* The stranded state: the paid cap has room (crew 0 < paid_cap 1), so the
         FIRST hr_worker_hire materialises for free. */
      window.HearthriseWorkersNet = Object.assign({}, origNet, {
        isSignedIn: () => true,
        hire: () => { netHired++; return Promise.resolve({ ok: true, uid: 'srv-strand', name: 'Aldric', crew: 1 }); },
      });
      G.workers = { hired: [] };
      const w = W.hire();
      assert(w, 'the optimistic worker must be created');
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      assert(netHired === 1, 'THE FIX: a stranded/available paid cap materialises on hr_worker_hire directly');
      assert(buyCalls === 0, 'NO repurchase is sent for a rung already paid — buyUnlock must not be called');
      assert(G.workers.hired.length === 1 && G.workers.hired[0].uid === 'srv-strand',
        'the crew survives and takes the server uid; got ' + JSON.stringify(G.workers.hired.map((x) => x.uid)));
      assert(!toasts.some((t) => /could not complete/i.test(t)), 'no failure toast when the cap is already paid');
    } finally {
      window.HearthriseGold = origGold; window.HearthriseWorkersNet = origNet;
      window.HearthriseHomestead = origHomestead; window.clientMayWriteRecordField = origMay;
      window.balCanAfford = origAfford; window.goldSettle = origSettle; window.goldIntentKey = origKey;
      window.notify = origNotify;
      restoreG(snap);
    }
  }),

  () => tryRun('LASTSEEN-1 (b463): lastSeen keeps beating under the retired blob — the welcome modal must not invent an absence', () => {
    /* The stamp lived below saveLocal's blob-retire early-return, so arming the
       capstone froze it at the residue's ancient value and every session opened
       with "Time away 17h 46m" for a player who never left (Tyler, live).
       saveLocal runs on a 90s heartbeat + 34 call sites; the stamp now sits
       BEFORE the retire gate and only advances while the tab is visible. */
    const C = window.HearthriseCapstone, G = window.G;
    if (!C || !C.isBlobRetired()) return;             // only meaningful with the capstone armed
    const prev = G.lastSeen;
    try {
      G.lastSeen = Date.now() - 8 * 3600 * 1000;      // a stale stamp, 8h old
      window.saveLocal();
      assert(Date.now() - G.lastSeen < 5000,
        'THE BUG: saveLocal under the retired blob must still advance lastSeen (got a stamp '
        + Math.round((Date.now() - G.lastSeen) / 60000) + 'm old)');
    } finally { G.lastSeen = prev; }
  }),

  () => tryRun('SLOT-BUY-1: a hero slot can actually be bought under the shipped capstone', () => withClientOwnedSlots(() => {
    const HP = window.HearthriseProfile, G = window.G;
    if (!HP || !HP.profile) return;
    const C = window.HearthriseCapstone;
    if (!C || !C.isBlobRetired()) return;             // only meaningful with the capstone armed
    const next = HP.canUnlockNext();
    if (!next || next.free) return;                   // only a real gem spend proves this
    const prevGems = G.gems, prevUnlocked = G.heroSlotsUnlocked;
    const prevProfile = JSON.parse(JSON.stringify(HP.profile));
    try {
      G.gems = next.cost + 1000;
      stampRecordLikeLoad(G);                         // a genuinely KNOWN, sufficient balance
      const r = HP.unlockSlot(next.slotId);
      assert(r && r.ok,
        'a player who can afford a hero slot cannot buy one: unlockSlot answered "'
        + (r && r.reason) + '". `unlockSlot` proves durability by reading the local save blob back, and the '
        + 'b455 capstone retires that blob — so the readback is null, `durable` is false and the purchase '
        + 'rolls back for every player, every time. The durability proof has to move to a store that still '
        + 'exists (a server slot-purchase verb, or the durable profile/client_state record); deleting the '
        + 'proof would bring back the b371 dupe.');
      assert(G.gems === 1000, 'the gems were not actually spent');
      assert(HP.unlockedCount() === next.slotId + 1, 'the slot was not unlocked');
    } finally {
      G.gems = prevGems;
      G.heroSlotsUnlocked = prevUnlocked;
      HP.profile = prevProfile;
      try { localStorage.setItem('hearthrise:profile', JSON.stringify(prevProfile)); } catch (e) {}
      try { window.updateTopbar(); } catch (e) {}
      stampRecordLikeLoad(G);
    }
  })),

  () => tryRun('b371: a slot purchase survives a save that throws — the durable store is the server, not a local file', () => withClientOwnedSlots(() => {
    const HP = window.HearthriseProfile, G = window.G;
    if (!HP || !HP.profile) return;
    const next = HP.canUnlockNext();
    if (!next || next.free) return;
    const prevGems = G.gems, prevUnlocked = G.heroSlotsUnlocked;
    const prevProfile = JSON.parse(JSON.stringify(HP.profile));
    const realSave = window.saveLocal;
    try {
      G.gems = next.cost + 1000;
      stampBalanceLikeLoad(G);   // armed: unlockSlot's affordability read must be KNOWN so it reaches the save step
      /* b515 — THE DORMANT HALF IS RETIRED AND THE PROPERTY INVERTED. This test
         used to grade two positions. DORMANT: `unlockSlot` read the save blob
         back and refused the purchase ("Couldn't save your purchase") if both
         halves were not in it — atomic-or-nothing against a local file. ARMED:
         the same forced save failure must NOT block the purchase.

         b515 deleted the read-back proof and its refund arm from
         multi-character.js, because the else-arm that reached it was live only
         on a device holding the retired `hr:serverAccrual=off` — i.e. a GEM
         SPEND proved against a local file. There is one position now and it is
         the armed one, so that is what is asserted, unconditionally.

         WHAT REPLACED THE PROOF, and why this is not a weakening: the b371 dupe
         was a LOCAL-BLOB SPLIT (the entitlement outlived the payment because the
         two halves landed in one file and only one of them was written). The
         armed model cannot express that split — the entitlement rides the
         residue PUT and the gem debit is a SERVER record field reconciled by the
         next envelope — and the ownership half is asserted against the server by
         the SLOT-SRV battery below. What must hold HERE is that a throwing
         `saveLocal` (a full disk, a private-mode quota) can no longer take a
         purchase down with it, because it is no longer on the path.
         MUTATION: re-introduce a `try{saveLocal()}catch{ return {ok:false} }`
         around the grant → red on the first assertion. */
      window.saveLocal = function () { throw new Error('quota exceeded'); };
      const r = HP.unlockSlot(next.slotId);
      assert(r && r.ok,
        'a throwing saveLocal blocked the purchase: ' + JSON.stringify(r) + ' — the local blob is retired, '
        + 'so a local write failure is not evidence about a purchase and must not brick one (b459)');
      assert(HP.unlockedCount() === next.slotId + 1,
        'the purchase reported ok but the slot was not granted: ' + HP.unlockedCount());
      /* AND NOTHING WAS PROVED AGAINST A LOCAL FILE. The refusal vocabulary that
         only the deleted read-back could produce must never come back — a gem
         spend adjudicated by localStorage is the shape b515 removed. */
      assert(!/couldn.t save/i.test(r.reason || ''),
        'the local-blob read-back proof is back: ' + r.reason);
    } finally {
      try { if (window.HearthriseCapstone && window.HearthriseCapstone.__setBlobRetired) window.HearthriseCapstone.__setBlobRetired(null); } catch (e) {}
      window.saveLocal = realSave;
      G.gems = prevGems;
      G.heroSlotsUnlocked = prevUnlocked;
      HP.profile = prevProfile;
      try { localStorage.setItem('hearthrise:profile', JSON.stringify(prevProfile)); } catch (e) {}
      try { window.saveLocal(); } catch (e) {}
      try { window.updateTopbar(); } catch (e) {}
    }
  })),

  /* ══════════════════════════════════════════════════════════════════════════
     SLOT-SRV — THE HERO SLOT IS THE SERVER'S NOW
     (supabase/migrations/2026-09-08-hero-slot-buy.sql)

     THE TWO DEFECTS THE PLAY-GATE FOUND ON PRODUCTION, from the client side:
       1. THE BUY BUTTON WAS LIT AND DEAD. hr_unlock_offers refuses the
          character_slot namespace by construction, and the only other path
          (unlockSlot's `G.gems -= cost`) is reconciled away by the next envelope
          because gems are SERVER-OF-RECORD and ARMED. So the click went through
          a confirm modal and produced nothing a player could see.
       2. OWNERSHIP WAS CLIENT-AUTHORED. `G.heroSlotsUnlocked` is residue; a
          restore rewinds it while the slot stays granted — the b371 gem dupe.

     The SERVER half is graded against real PostgreSQL by tests/hero-slot-buy.mjs
     (16 mutations, all caught). These four are the CLIENT contract: the honest
     button, the transport that sends no price, the server answer beating the
     residue, and the refusal reaching the player in the b494 voice. ══════════ */
  () => tryRun('SLOT-SRV-1: a Buy the server cannot be asked about is DISABLED, not lit', () => {
    /* THE DEFECT: `canBuy` means "this is the next rung", and both renderers
       read it as permission (the b465 finding). b465 fixed the AFFORDABILITY
       half; this is the other half — until hr_state_of has told us which slots
       this account owns, we do not know the purchase is even possible, and a lit
       button in that state is what dead-ended live. */
    const HP = window.HearthriseProfile, G = window.G;
    if (!HP || !HP.profile || typeof HP.slotRows !== 'function') return;
    const B = window.HearthriseBalance;
    const realBalanceNum = B && B.balanceNum;
    const had = Object.prototype.hasOwnProperty.call(G, '_heroSlots');
    const prev = had ? G._heroSlots : undefined;
    try {
      if (B) B.balanceNum = (g, f) => (f === 'gems' ? 999999 : realBalanceNum(g, f));

      // ── SERVER SILENT: the row is buyable-in-order but NOT offered. ──
      delete G._heroSlots;
      let row = HP.slotRows().filter((r) => r.kind === 'locked' && !r.free).find((r) => r.canBuy);
      assert(row, 'no next-buyable hero slot — the test proved nothing');
      assert(row.serverKnown === false,
        'slotRows() claims the server has answered when G._heroSlots is absent');
      assert(row.afford === true,
        'the fixture is degenerate: the row must be AFFORDABLE, so that a disabled button can only '
        + 'be about the server being silent and not about the gems');

      if (window.HearthriseHome && typeof window.HearthriseHome.render === 'function') {
        window.HearthriseHome.render();
        const rail = document.getElementById('panel-profile');
        if (rail && /Hero slot/.test(rail.textContent || '')) {
          assert(![...rail.querySelectorAll('[data-herobuy]')].length,
            'THE LIT-AND-DEAD BUTTON: the Home rail offers a live Buy for a slot the server has '
            + 'not confirmed. hr_buy_hero_slot is the only path that can complete a purchase, and '
            + 'we have not heard from it — the click would dead-end exactly as it did live.');
          assert(/Checking|Unavailable/.test(rail.textContent || ''),
            'a disabled hero-slot Buy must SAY why (b494 voice), not just go grey');
        }
      }

      // ── SERVER ANSWERED: the same row goes live. The guard must not just
      //    disable everything, which is the failure mode of a fail-closed fix.
      assert(typeof HP.adoptServerSlots === 'function',
        'HearthriseProfile.adoptServerSlots must be the door the hr_state_of projection comes in');
      HP.adoptServerSlots([0]);
      row = HP.slotRows().filter((r) => r.kind === 'locked' && !r.free).find((r) => r.canBuy);
      assert(row && row.serverKnown === true, 'the server answer did not reach slotRows()');
      if (window.HearthriseHome && typeof window.HearthriseHome.render === 'function') {
        window.HearthriseHome.render();
        const rail = document.getElementById('panel-profile');
        if (rail && /Hero slot/.test(rail.textContent || '')) {
          assert([...rail.querySelectorAll('[data-herobuy]')].length,
            'a slot the player can afford AND the server has confirmed must stay buyable');
        }
      }
    } finally {
      if (B && realBalanceNum) B.balanceNum = realBalanceNum;
      try { if (had) G._heroSlots = prev; else delete G._heroSlots; } catch (e) {}
      if (window.HearthriseHome && typeof window.HearthriseHome.render === 'function') {
        try { window.HearthriseHome.render(); } catch (e) {}
      }
    }
  }),

  () => tryRun('SLOT-SRV-2: the SERVER\'s owned set beats a forged G.heroSlotsUnlocked', () => {
    /* THE b371 DUPE, CLOSED AT THE READ. The residue is a self-authored number:
       a restore rewinds it, and devtools can raise it. Either way it must buy
       and unlock nothing once the server has spoken. */
    const HP = window.HearthriseProfile, G = window.G;
    if (!HP || !HP.profile) return;
    const had = Object.prototype.hasOwnProperty.call(G, '_heroSlots');
    const prev = had ? G._heroSlots : undefined;
    const prevUnlocked = G.heroSlotsUnlocked;
    const prevCache = HP.profile.unlockedSlots;
    try {
      HP.adoptServerSlots([0]);              // the server says: one hero
      G.heroSlotsUnlocked = 5;               // the forgery
      HP.profile.unlockedSlots = 5;          // …and the device-local cache agrees with it
      assert(HP.unlockedCount() === 1,
        'THE FORGED ENTITLEMENT: G.heroSlotsUnlocked = 5 still grants slots. The server projection '
        + 'must beat the residue — that residue is exactly the store a cloud restore rewinds while '
        + 'the slot stays granted (b371).');
      assert(HP.ownsSlot(3) === false, 'a forged residue unlocked slot 3');
      assert(HP.switchSlot(3) === null, 'a slot the account does not own could still be switched to');
      const rows = HP.slotRows();
      assert(!rows.some((r) => r.kind === 'char' && r.id === 3),
        'a forged residue listed slot 3 as a playable character');

      /* …and a GRANDFATHERED hole is honoured, because the server's set is the
         answer and hr_hero_slots_of counts an existing character as ownership.
         Production's shape: zero character_slot flag rows, one two-hero account. */
      HP.adoptServerSlots([0, 1]);
      assert(HP.ownsSlot(1) === true, 'a server-owned slot was not honoured');
      assert(HP.unlockedCount() === 2, 'the server set of [0,1] must read as two heroes');
      const nx = HP.canUnlockNext();
      assert(nx && nx.slotId === 2,
        'the ladder must point at the first slot the SERVER says is missing, got '
        + JSON.stringify(nx));
      assert(nx.free === false,
        'under the server answer the Hearth Hall waiver is decided SERVER-SIDE (a waived slot '
        + 'arrives already owned), so a device-local entitlements claim must not make a slot free');
    } finally {
      G.heroSlotsUnlocked = prevUnlocked;
      HP.profile.unlockedSlots = prevCache;
      try { if (had) G._heroSlots = prev; else delete G._heroSlots; } catch (e) {}
    }
  }),

  () => tryRunAsync('SLOT-SRV-3: under the gems arm buySlot sends an INTENT and never a price', async () => {
    /* The transport contract, driven through the real buySlot: the confirm modal
       still runs (a premium spend is never one click), then the server verb gets
       a slot id, a character slot and an idempotency key — and nothing else. */
    const HP = window.HearthriseProfile, G = window.G;
    if (!HP || !HP.profile || typeof HP.buySlot !== 'function') return;
    const origGC = window.HearthriseGoalClaim, origMay = window.clientMayWriteRecordField;
    const origNotify = window.notify, origRec = window.HearthriseRecord;
    const had = Object.prototype.hasOwnProperty.call(G, '_heroSlots');
    const prev = had ? G._heroSlots : undefined;
    const prevGems = G.gems, prevUnlocked = G.heroSlotsUnlocked;
    const prevProfile = JSON.parse(JSON.stringify(HP.profile));
    const sent = []; const toasts = []; let refreshed = 0;
    try {
      HP.adoptServerSlots([0]);
      window.clientMayWriteRecordField = () => false;           // gems ARMED
      window.notify = (m) => { toasts.push(String(m)); };
      /* STUBBED, and not only for tidiness: the real requestRecord() drives a
         live hr_load that REPLACES the record on the shared G, landing a network
         response into whichever test happens to be running by then. A
         fire-and-forget real request is how one test poisons another. Stubbing
         it also lets the refresh itself be ASSERTED rather than merely allowed. */
      window.HearthriseRecord = Object.assign({}, origRec, {
        requestRecord: () => { refreshed++; return Promise.resolve(null); },
      });
      window.HearthriseGoalClaim = Object.assign({}, origGC, {
        buyHeroSlot: (id) => {
          sent.push(id);
          return Promise.resolve({ ok: true, slot_id: id, cost: 200, gems: 40,
            hero_slots: [0, 1] });
        },
      });
      const p = HP.buySlot(1);
      // The in-game confirm (never window.confirm — b371) has to be answered.
      await new Promise((r) => setTimeout(r, 0));
      const yes = document.querySelector('#hr-confirm-overlay [data-hrc="yes"]');
      assert(yes, 'buySlot did not raise the in-game confirm — a premium spend is never one click');
      yes.click();
      const r = await p;

      assert(sent.length === 1 && sent[0] === 1,
        'buySlot did not send exactly one hero-slot intent: ' + JSON.stringify(sent));
      assert(r && r.ok === true && r.server === true,
        'the server purchase did not report success: ' + JSON.stringify(r));
      assert(G.gems === prevGems,
        'THE SELF-MINT: buySlot debited G.gems locally under the arm. The server owns that balance; '
        + 'a local debit is reconciled away by the next envelope while the slot stays granted, '
        + 'which is the b371 dupe.');
      assert(HP.unlockedCount() === 2,
        'the receipt\'s hero_slots was not adopted — the drawer would not repaint until the next '
        + 'envelope');
      assert(toasts.some((t) => /Unlocked Hero 2/.test(t)), 'the purchase said nothing to the player');
      assert(refreshed === 1,
        'the purchase did not refresh the balance record. `res.gems` is for RENDERING; the record '
        + 'is what every affordability check reads, so without the refresh the gem chip keeps the '
        + 'pre-purchase number until the next envelope (the b371 P2 stale-chip class).');
    } finally {
      window.HearthriseGoalClaim = origGC;
      window.clientMayWriteRecordField = origMay;
      window.HearthriseRecord = origRec;
      window.notify = origNotify;
      G.gems = prevGems; G.heroSlotsUnlocked = prevUnlocked;
      HP.profile = prevProfile;
      try { localStorage.setItem('hearthrise:profile', JSON.stringify(prevProfile)); } catch (e) {}
      try { if (had) G._heroSlots = prev; else delete G._heroSlots; } catch (e) {}
      try { document.getElementById('hr-confirm-overlay')?.remove(); } catch (e) {}
    }
  }),

  () => tryRunAsync('SLOT-SRV-4: a server refusal reaches the player by NAME, and charges nothing', async () => {
    /* The b494 voice. A player told "you cannot afford it" when the real answer
       is "sign in" files the wrong bug — and this surface's entire failure mode
       for several builds was silence. */
    const HP = window.HearthriseProfile, G = window.G;
    if (!HP || !HP.profile || typeof HP.buySlot !== 'function') return;
    const origGC = window.HearthriseGoalClaim, origMay = window.clientMayWriteRecordField;
    const had = Object.prototype.hasOwnProperty.call(G, '_heroSlots');
    const prev = had ? G._heroSlots : undefined;
    const prevGems = G.gems;
    const cases = [
      ['insufficient_gems', /Not enough gems/i, { short_by: 150 }], ['rpc_missing', /unavailable/i, {}],
      ['not_signed_in', /Sign in/i, {}], ['rate_limited', /Slow down/i, {}],
      ['requires_previous_slot', /Unlock the slot before it/i, {}],
    ];
    try {
      window.clientMayWriteRecordField = () => false;
      for (const [code, want, extra] of cases) {
        HP.adoptServerSlots([0]);
        window.HearthriseGoalClaim = Object.assign({}, origGC, {
          buyHeroSlot: () => Promise.resolve(Object.assign({ ok: false, error: code }, extra)),
        });
        const p = HP.buySlot(1);
        await new Promise((r) => setTimeout(r, 0));
        document.querySelector('#hr-confirm-overlay [data-hrc="yes"]')?.click();
        const r = await p;
        assert(r && r.ok !== true, `'${code}' was reported as a successful purchase`);
        assert(want.test(String(r.reason || '')),
          `'${code}' rendered as "${r.reason}" — every machine code needs its own honest sentence, `
          + 'or the player files the wrong bug (b494)');
        assert(G.gems === prevGems, `'${code}' moved gems on a refusal`);
        assert(HP.unlockedCount() === 1, `'${code}' granted the slot anyway`);
      }
      // …and a refusal must never leave the in-flight latch stuck.
      HP.adoptServerSlots([0]);
      window.HearthriseGoalClaim = Object.assign({}, origGC, {
        buyHeroSlot: () => Promise.resolve({ ok: false, error: 'rate_limited' }),
      });
      const p2 = HP.buySlot(1);
      await new Promise((r) => setTimeout(r, 0));
      document.querySelector('#hr-confirm-overlay [data-hrc="yes"]')?.click();
      const r2 = await p2;
      assert(r2 && r2.cancelled !== true,
        'a second attempt after a refusal was swallowed by the in-flight latch — the player would '
        + 'have to reload to retry a purchase that failed');
    } finally {
      window.HearthriseGoalClaim = origGC;
      window.clientMayWriteRecordField = origMay;
      G.gems = prevGems;
      try { if (had) G._heroSlots = prev; else delete G._heroSlots; } catch (e) {}
      try { document.getElementById('hr-confirm-overlay')?.remove(); } catch (e) {}
    }
  }),

  /* ── regression suite — THE RESIDUE-AHEAD HALF OF THE HERO SLOTS ─────────
     `G.heroSlotsUnlocked` is RESIDUE, and multi-character.js reached it whenever
     the `G._heroSlots` projection was absent — a WHOLE SESSION, per record.js's
     hydration note. A slot above 0 is an entitlement the server sells and refuses
     (`slot_not_owned`), so a stale or forged residue listed heroes the account
     does not own and let the player walk into one: a door the realm slams
     (CLAUDE.md §6 — a gate fails safe to NOT UNLOCKED). Both directions, because
     refusing what the server GRANTED is the other way to break this. */
  () => tryRun('SLOT-SRV-5 (b537): with the mirror absent the residue opens NOTHING above slot 0', () => {
    const HP = window.HearthriseProfile, G = window.G;
    if (!HP || !HP.profile || typeof HP.ownsSlot !== 'function') return;
    const SAVE_KEY = 'hearthbound-save-v2';
    const snap = snapshotG();
    const prevProfile = JSON.parse(JSON.stringify(HP.profile));
    const prevSave = localStorage.getItem(SAVE_KEY);
    const prevChars = [0, 1, 2, 3, 4].map((i) => localStorage.getItem('hearthrise:char:' + i));
    try {
      // ── THE BOOT STATE THE BUG LIVES IN: no projection, a residue that lies.
      delete G._heroSlots;
      G.heroSlotsUnlocked = 3;                 // "you own three heroes" — says the client
      HP.profile.unlockedSlots = 3;            // …and so does the device-local cache
      const active = HP.activeSlot();

      assert(HP.ownsSlot(0) === true,
        'slot 0 is free on every account and the fail-safe must not take it away');
      for (const n of [1, 2, 3, 4]) {
        assert(HP.ownsSlot(n) === false,
          'RESIDUE-AHEAD: with hr_state_of silent, G.heroSlotsUnlocked=3 still granted slot ' + n + '. '
          + 'hr_buy_hero_slot answers slot_not_owned for exactly this account, so the client is lighting '
          + 'a door the server slams — and a forged residue is a free hero');
      }
      assert(HP.unlockedCount() === 1,
        'unlockedCount() answered ' + HP.unlockedCount() + ' from the residue while the server has said '
        + 'nothing — every ladder and every list in the module reads this');
      const rows = HP.slotRows();
      assert(rows.filter((r) => r.kind === 'char').every((r) => r.id === 0 || r.id === active),
        'the drawer listed a hero the server has not confirmed: '
        + JSON.stringify(rows.filter((r) => r.kind === 'char').map((r) => r.id)));
      assert(HP.listSlots().every((s) => s.id === 0 || s.id === active),
        'listSlots() offered a character row the account may not own');
      /* THE PLAYER-VISIBLE GATE, ordered after the pure reads on purpose: an
         unfixed build is already red above, so it never reaches a real swap. */
      assert(HP.switchSlot(1) === null,
        'THE SWITCH ITSELF: a hero slot the server never sold could be entered — the b371 dupe with the '
        + 'gems left out');

      // ── AND THE OTHER DIRECTION: what the server DID sell still opens. ──
      HP.adoptServerSlots([0, 1]);
      assert(HP.ownsSlot(1) === true && HP.ownsSlot(2) === false,
        'the projection [0,1] must grant exactly slots 0 and 1 — a fail-closed gate that ignores the '
        + 'server answer locks a paying player out of a hero they bought');
      assert(HP.unlockedCount() === 2,
        'the server set of two heroes must read as two: ' + HP.unlockedCount());
    } finally {
      HP.profile = prevProfile;
      try { localStorage.setItem('hearthrise:profile', JSON.stringify(prevProfile)); } catch (e) {}
      try {
        if (prevSave === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, prevSave);
        prevChars.forEach((v, i) => {
          if (v === null) localStorage.removeItem('hearthrise:char:' + i);
          else localStorage.setItem('hearthrise:char:' + i, v);
        });
      } catch (e) {}
      restoreG(snap);                          // heroSlotsUnlocked + _heroSlots ride the allowlist
      try { if (G && G._heroSlots === null) delete G._heroSlots; } catch (e) {}
    }
  }),

  /* ── b372 P0 — THE SWITCH DUPLICATED THE CHARACTER ─────────────────────
     REPORTED LIVE (FTUE run on b371): switching to hero slot 1 put a COPY of the
     slot-0 character there and DESTROYED the save that had been in it. The
     reload fires `pagehide` while `window.G` is still the OUTGOING character,
     and a write in that window resolves its slot LIVE — i.e. onto the TARGET.
     switchSlotAsync has already awaited a cloud flush and refuses to swap
     without one, so the switch QUIESCES those writes.
     MUTATION: make buildSnapshotRequest use resolveActiveSlot() again → RED on
     the slot assertion; give saveLocal() its blob write back → RED on the parked
     save (PARKED below, because the switch clears SAVE_KEY itself, so reading an
     absence asserted nothing). The residue PUT that carries the character today
     is watched on the wire by tests/slot-switch.mjs — in-page cannot see it. */
  () => tryRunAsync('b372: a hero-slot switch cannot clone the outgoing character into the target slot (pagehide race)', async () => {
    const HP = window.HearthriseProfile, S = window.HearthriseSync, G = window.G;
    if (!HP || !HP.profile) return;
    assert(typeof HP.saveQuiesced === 'function' && typeof HP.quiescedOutgoingSlot === 'function',
      'the switch quiesce latch is gone — nothing stops the pagehide autosave from writing the outgoing '
      + 'character into the incoming slot, which is the b372 duplication bug');
    const SAVE_KEY = 'hearthbound-save-v2', TARGET = 1, CHAR1 = 'hearthrise:char:1';
    const PARKED = '{"__parked":"switch-window"}';   // a value nothing in the game writes
    const prevProfile = JSON.parse(JSON.stringify(HP.profile));
    const prevUnlocked = G.heroSlotsUnlocked;
    const hadSrv = Object.prototype.hasOwnProperty.call(G, '_heroSlots');
    const prevSrv = hadSrv ? G._heroSlots : undefined;
    const prevSave = localStorage.getItem(SAVE_KEY);
    const prevChar1 = localStorage.getItem(CHAR1);
    const prevChar0 = localStorage.getItem('hearthrise:char:0');
    const realSnapshotIfDue = S && S.snapshotIfDue;
    let during = null;
    try {
      HP.profile = { activeSlot: 0, unlockedSlots: 2, version: 1,
        slots: [{ id: 0, name: 'Outgoing' }, { id: 1, name: 'Target' }] };
      G.heroSlotsUnlocked = 2;                       // the entitlement lives in the save (b371)
      /* …and, since 2026-09-08, the SERVER is the authority on it: switchSlotAsync
         asks ownsSlot(), which prefers hr_state_of's projection over the residue
         (that residue is the store a restore rewinds while the slot stays
         granted — the b371 dupe). Stating the fixture in BOTH stores is what
         makes this test about the QUIESCE LATCH rather than about whichever
         account happens to be signed in: without it the switch would be refused
         on any account that does not really own a second hero, and every
         assertion below would read as a b372 regression. */
      if (typeof HP.adoptServerSlots === 'function') HP.adoptServerSlots([0, 1]);
      localStorage.removeItem(CHAR1);                // target slot EMPTY — exactly the live repro
      // The awaited pre-swap flush. Answering it is what lets the swap proceed.
      if (S && typeof S.snapshotIfDue === 'function') S.snapshotIfDue = () => Promise.resolve(true);

      const r = await HP.switchSlotAsync(TARGET, {
        noReload: true,
        /* THE TRANSITION WINDOW: pointer moved, page not yet replaced. This is
           where the browser fires pagehide during the real reload. */
        duringTransition: () => {
          const quiesced = HP.saveQuiesced();
          const outgoing = HP.quiescedOutgoingSlot();
          const active = HP.activeSlot();
          try { localStorage.setItem(SAVE_KEY, PARKED); } catch (e) {}   // see PARKED
          try { window.dispatchEvent(new Event('pagehide')); } catch (e) {}
          try { window.saveLocal(); } catch (e) {}   // and any other autosave in the same window
          during = { quiesced, outgoing, active,
            save: localStorage.getItem(SAVE_KEY),
            snapSlot: (S && typeof S.buildSnapshotRequest === 'function')
              ? S.buildSnapshotRequest({ snapshotEndpoint: 'https://p.supabase.co/rest/v1/game_saves' },
                'user-A', { gold: 1 }, Date.now()).body.slot
              : null };
        },
      });

      assert(r && r.ok, 'the switch itself failed, so nothing below was exercised: ' + (r && r.reason));
      assert(during, 'the transition seam never ran — every assertion here would have been vacuous');
      assert(during.active === TARGET,
        'the slot pointer had not moved when the seam ran (active ' + during.active + ') — the hazard window '
        + 'this test exists for was never entered');
      assert(during.quiesced === true,
        'saves were NOT quiesced during the switch — the pagehide autosave is free to run');
      assert(during.outgoing === 0,
        'the latch names slot ' + during.outgoing + ' as the character in memory; it is the OUTGOING slot 0, '
        + 'and any write that escapes must be addressed there');
      assert(during.save === PARKED,
        'THE b372 CLONE CHANNEL IS OPEN AGAIN: something wrote local character state during the switch — the '
        + 'sentinel parked at ' + SAVE_KEY + ' came back as ' + JSON.stringify(during.save) + '. The local blob '
        + 'is retired (saveLocal is a lastSeen stamp), and a write here is addressed by the profile pointer, '
        + 'which already stands on slot ' + TARGET + ': the next boot would adopt the OUTGOING character as the '
        + 'target hero and destroy the one that lived there');
      assert(during.snapSlot === 0,
        'a snapshot sent during the switch is addressed to slot ' + during.snapSlot + ' — game_saves is '
        + 'UNIQUE (user_id, slot), so that upsert overwrites the TARGET character\'s cloud row with the '
        + 'outgoing one. It must carry the outgoing slot (0)');

      // …and the latch does not outlive the switch: normal saving resumes.
      assert(HP.saveQuiesced() === false,
        'the quiesce latch was never released on a no-reload switch — local saving is now off for this session, '
        + 'which trades a duplication bug for silent data loss');
    } finally {
      if (S && realSnapshotIfDue) S.snapshotIfDue = realSnapshotIfDue;
      HP.profile = prevProfile;
      G.heroSlotsUnlocked = prevUnlocked;
      try { if (hadSrv) G._heroSlots = prevSrv; else delete G._heroSlots; } catch (e) {}
      try { localStorage.setItem('hearthrise:profile', JSON.stringify(prevProfile)); } catch (e) {}
      try { if (prevSave === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, prevSave); } catch (e) {}
      try { if (prevChar1 === null) localStorage.removeItem(CHAR1); else localStorage.setItem(CHAR1, prevChar1); } catch (e) {}
      try { if (prevChar0 === null) localStorage.removeItem('hearthrise:char:0'); else localStorage.setItem('hearthrise:char:0', prevChar0); } catch (e) {}
      try { window.saveLocal(); } catch (e) {}
      try { window.updateTopbar(); } catch (e) {}
    }
  }),

  /* ── b372 · regression suite — THE HOLE THE QUIESCE LATCH DID NOT COVER ─────
     The switch defence in src/net/sync.js refuses to START a send while quiesced
     and re-addresses one already in flight — but that second layer only ever
     reached `buildSnapshotRequest` (game_saves). The residue PUT that REPLACED the
     blob was addressed `pinnedSlot: config.slot`, null in production, so the slot
     came from `HearthriseProfile.activeSlot()` LIVE at BODY-BUILD time — after
     `await fetchClaimRow()`, the one await a switch can land inside. The outgoing
     hero's residue then upserted onto the TARGET hero's client_state row.
     THIS PLAYS THAT ORDER: park the claim read, move the hero pointer while the
     save is suspended on it, release, read the slot off the WIRE (the shape
     tests/slot-switch.mjs watches). The pointer moves WITHOUT arming the quiesce
     latch on purpose — an armed latch answers correctly even when the slot is
     resolved late, so it would hide the defect.
     MUTATION: restore `pinnedSlot: config.slot` → RED here. */
  () => tryRunAsync('b372: a residue save parked on the claim read keeps the slot it started for — a switch mid-read cannot re-address it', async () => {
    const S = window.HearthriseSync, HP = window.HearthriseProfile, G = window.G;
    assert(HP && typeof HP.activeSlot === 'function' && typeof S.__setClaimView === 'function',
      'the profile slot resolver or the claim-view seam is gone — the residue PUT cannot be addressed or observed');
    const realActiveSlot = HP.activeSlot, prevName = G.playerName, puts = [];
    let liveSlot = 0, releaseClaim = null;
    try {
      G.playerName = 'OUTGOING-b372';        // a RESIDUE field, so the bag is never empty
      HP.activeSlot = () => liveSlot;
      S.__setClaimView(null);                // view unknown ⇒ the cadence save must read it
      await withResidueWire((url, init) => {
        if (!/hr_put_client_state/.test(url)) {
          return new Promise((res) => { releaseClaim = () => res(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })); });
        }
        let b = null; try { b = JSON.parse((init && init.body) || 'null'); } catch (e) {}
        puts.push({ slot: b ? b.p_slot : null, name: (b && b.p_patch) ? b.p_patch.playerName : null, active: HP.activeSlot() });
      }, async () => {
        const p = S.snapshotIfDue(true, false);            // the 60s cadence save, NOT the parting shot
        for (let i = 0; i < 20 && !releaseClaim; i++) await Promise.resolve();
        assert(typeof releaseClaim === 'function',
          'the cadence save never parked on the claim read (paused ' + S.isPaused() + ', held ' + S.isSnapshotHeld()
          + ', puts ' + puts.length + ') — the window this test exists for was never entered');
        assert(puts.length === 0,
          'the residue PUT was on the wire BEFORE the claim read answered, so a switch cannot be staged inside '
          + 'the await — this test no longer reproduces the reported order');
        liveSlot = 1;                                      // THE SWITCH LANDS: the hero pointer moves
        releaseClaim();
        await p;
      }, { claimEndpoint: 'https://example.invalid/rest/v1/session_claims' });
      assert(puts.length === 1 && puts[0].name === 'OUTGOING-b372',
        'CONTROL: the parked cadence save must produce exactly one residue PUT carrying the OUTGOING character, '
        + 'got ' + JSON.stringify(puts) + ' — without it every assertion here is vacuous');
      assert(puts[0].active === 1,
        'the hero pointer read 0 at body-build time — the hazard is that it had already moved, so this run '
        + 'proves nothing');
      assert(puts[0].slot === 0,
        'THE BUG: a residue save that started for hero slot 0 and parked on the claim read built its body AFTER '
        + 'the switch and went out addressed to slot ' + puts[0].slot + '. client_state is UNIQUE (user_id, slot), '
        + 'so the outgoing hero\'s bestiary, quests, achievements and name are upserted onto the TARGET hero\'s '
        + 'row — the b372 duplication on the one periodic write the armed game makes');
    } finally {
      HP.activeSlot = realActiveSlot;
      if (prevName === undefined) delete G.playerName; else G.playerName = prevName;
      S.__setClaimView(null);
    }
  }),

  /* b372 — THE BOOT HALF. Even with the latch, a save that belongs to another
     hero slot must never be adopted as this one: the latch closes the writer we
     found, this closes the class. Park (recoverable), never delete, and boot as
     if there were no local save — cloud or fresh character. */
  /* b456: driven with the blob LIVE. Under the capstone `loadLocal()` returns
     before it reads, so the mis-slot check never runs — and the assertion that the
     bytes were PARKED (never deleted, b318 policy) reads a `null` SAVE_KEY as
     "deleted" because the retired path removes the blob on the way past. The
     slot-mismatch park is the guard against the b372 clone incident (one character
     uploaded over another) and still ships behind the flag.
     ⚠ It also drives a REAL load, which strips the record off the live G — so the
       finally takes a FULL snapshot back and re-stamps it (see restoreGAndRecord). */
  /* b372-PARK IS RETIRED (b515). It proved that `loadLocal()` PARKED (never
     deleted) a blob stamped for a different hero slot rather than adopting it —
     "a blob written by one character is then indistinguishable from the next
     one's, which is how the b372 clone survived boot".

     `loadLocal()` does not adopt ANY blob now, stamped or not: b515 deleted the
     ~120-line read, and what remains is `_removeSave(SAVE_KEY)` plus
     `forgetServerOfRecord(G)`. The clone this defended against cannot be
     expressed, and the replacement is STRICTER than parking, not weaker — a
     foreign blob is dropped rather than set aside, and CAPSTONE-NOOP asserts
     exactly that ("loadLocal left the leftover blob in place — a later disarm
     would resurrect a pre-wipe save"). The slot-identity half of b372 that is
     still live — a switch quiesces the upload so an in-flight save is addressed
     to the OUTGOING character — is `switchQuiesced()` in sync.js and is covered
     by tests/slot-switch.mjs. */

  () => tryRun('b232: every route still resolves (character overview / skills activity / profile)', () => {
    const prevPane = window._charPane;
    try {
      window.showTab('character');
      assert(document.getElementById('panel-character').classList.contains('active'), 'character route broke');
      window.showTab('skills');
      assert(document.getElementById('panel-skills').classList.contains('active'), 'skills route must resolve to the standalone activity screen');
      window.showTab('profile');
      assert(document.getElementById('panel-profile').classList.contains('active'), 'profile route broke');
    } finally { window._charPane = prevPane; window.showTab('profile'); }
  }),

  () => tryRun('b269: pet session-impact tracker counts real contributions + surfaces the chip/modal', () => {
    const PS = window.HearthrisePetSession;
    assert(PS && typeof PS.recordProc === 'function' && typeof PS.recordXp === 'function',
      'HearthrisePetSession seam missing — the tracker was not built');
    const G = window.G;
    const snap = G.companions ? JSON.parse(JSON.stringify(G.companions)) : null;
    try {
      // Equip a pet whose bonus we know: the Fox (allXP + a gold proc).
      G.companions = G.companions || { ownedIds: ['fox'], xp: {}, equipped: null };
      if (G.companions.ownedIds.indexOf('fox') < 0) G.companions.ownedIds.push('fox');
      G.companions.xp = G.companions.xp || {};
      G.companions.equipped = 'fox';
      PS._reset();

      // A proc pays a concrete amount — the tracker must record exactly it.
      PS.recordProc('extraGold', 5, {});
      let a = PS.get();
      assert(a && a.petId === 'fox', 'accumulator must key on the equipped pet');
      assert(a.gold === 5, 'gold proc must add its real amount, got ' + a.gold);
      assert(a.procs === 1, 'proc count must increment, got ' + a.procs);

      // A doubled drop records the item and its quantity.
      PS.recordProc('doubleDrop', 0, { lastDrop: { id: 'copper_ore', qty: 2 } });
      a = PS.get();
      assert(a.drops === 2 && a.dropItems.copper_ore === 2, 'doubled drop must record item+qty');

      // XP attribution is the pet's real marginal allXP after the budget.
      const before = a.xp;
      PS.recordXp(1000);
      a = PS.get();
      assert(a.xp > before, 'bonus XP must accrue from the Fox allXP share, got ' + a.xp);

      // The chip mounts beside the avatar in the topbar.
      PS.injectChip();
      const chip = document.getElementById('hr-pet-chip');
      assert(chip && chip.closest('.topbar .player'), 'pet chip must mount inside the topbar player block');

      // The modal opens and renders the honest breakdown (reuses RoomModal).
      if (window.HearthriseRoomModal) {
        PS.openModal();
        const scrim = document.querySelector('.hr-room-scrim');
        assert(scrim, 'clicking the chip must open a RoomModal-style panel');
        const txt = scrim.textContent;
        assert(/Fox/.test(txt), 'the modal must be titled by the pet name');
        assert(/Bonus XP granted/.test(txt) && /Gold contributed/.test(txt),
          'the modal must show the real contribution breakdown');
        window.HearthriseRoomModal.close();
      }
    } finally {
      if (snap) G.companions = snap;
      const c = document.getElementById('hr-pet-chip'); if (c) c.remove();
      PS._reset();
    }
  }),

  /* ═══════════════════════════════════════════════════════════════════════
     THE UNIFICATION BATTERY — docs/design/away-time-ruling.md

     The ruling's whole force is "one formula, context flag". That is not a
     property you can review for; it is a property you MEASURE by running the same
     seeded fight through both flags and diffing. Test 1 IS the contract, and
     the other eight are the rulings it does not cover.

     Every one of these fails without the change. Test 1 fails loudest: before
     the unification the away path granted no kill XP and rolled no crits, so
     the two columns disagreed by ~30%.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Shared rig: stand the player in a known fight with a known loadout, run
     N ticks under a PINNED seed through a given away flag, and report totals.
     Nothing here reads the wall clock except through `atMs`, which is passed. */
  () => tryRun('AWAY-1 PARITY (the contract): the same seeded fight pays identically through away:false and away:true', () => {
    const G = window.G;
    const C = window.HearthriseCore;
    const P = window.HearthrisePresence;
    const snap = snapshotG();
    const origBonus = window.getBonus;
    try {
      /* Blessings and consumables OFF, as the ruling specifies — those are the
         two channels that are *meant* to differ, so leaving them in would test
         nothing. Everything else (gear, perks, crit, BotD) must match exactly. */
      window.getBonus = () => 0;
      G.buffs = [];

      const run = (away) => {
        G.skills = Object.assign({}, G.skills, { attack: 40000, strength: 40000, hitpoints: 15000, defense: 15000 });
        G.activeMonster = 'goblin';
        const m = window.MONSTERS.goblin;
        G.monsterHp = m.hp; G.monsterMaxHp = m.hp;
        G.playerMaxHp = 60; G.playerHp = 60;
        G.gold = 0;
        G.inventory = {};
        G.skills = Object.assign({}, G.skills);
        G.stats = Object.assign({}, G.stats, { kills: 0, crits: 0, deaths: 0, rareDrops: 0 });
        /* b341: the rig's contract is IDENTICAL STARTING STATE, and quests are
           now part of it — the hundred-kill milestone pays a one-time 1,500 XP
           at its 100th kill, and this rig lands well past 100. Left un-reset,
           the live run collected it and the away run could not, and the parity
           assertion read that as a 1,500 XP away shortfall: a false red that
           accuses the away path of the exact crime this test exists to detect.
           Resetting makes it a STRONGER assertion — the quest payout must land
           identically through both paths. */
        G.quests = [];
        /* b515 — MEASURE ONE THING, NOT TWO. This read `xpMap()` (the DISPLAY
           ladder: the server's map plus this session's predictions) as `before`
           and raw `G.skills` as `after`. That was harmless while the suite ran
           client-authoritative — `addXp` wrote `G.skills` and no prediction
           existed — and it inverted the moment the b353 kill switch was retired:
           `skills` is SERVER-OF-RECORD and ARMED, so a kill's XP is a PREDICTION
           and never a write to `G.skills`. The LIVE run left its predictions on
           the books, the AWAY run's `before` read them and its `after` did not,
           and the contract assertion reported the away path short by exactly the
           live run's payout — a false red accusing the away path of the one
           crime this test exists to detect.
           Both ends now read the DISPLAY, which is what the client actually
           produces under the arm and what the player is shown, and the ledger is
           zeroed at the top of each run so the two runs cannot contaminate each
           other. `goldOf()` is the same fix for gold, for the same reason. */
        predZero();
        const xpBefore = xpMap();
        const goldBefore = goldOf();
        C.reseed(0xC0FFEE);
        const body = () => {
          const ctx = window.HearthriseCombatSim.ctx();
          for (let i = 0; i < 240; i++) {
            if (!G.activeMonster) break;
            C.combatSim.simulateTick(G, ctx);
          }
        };
        if (away) P._withOfflineReplay(body); else body();
        const xpAfter = xpMap();
        const xp = {};
        Object.keys(xpAfter).forEach((k) => { const d = (xpAfter[k] || 0) - (xpBefore[k] || 0); if (d) xp[k] = d; });
        return {
          gold: goldOf() - goldBefore,
          kills: G.stats.kills,
          crits: G.stats.crits,
          xp,
          inventory: Object.assign({}, G.inventory),
        };
      };

      const live = run(false);
      const away = run(true);

      assert(live.kills > 0, 'the rig produced no kills — the parity assertion would be vacuous');
      assert(JSON.stringify(live.xp) === JSON.stringify(away.xp),
        'XP DIVERGED between live and away.\n  live: ' + JSON.stringify(live.xp) + '\n  away: ' + JSON.stringify(away.xp));
      assert(live.gold === away.gold, 'gold diverged: live ' + live.gold + ' vs away ' + away.gold);
      assert(live.kills === away.kills, 'kills diverged: live ' + live.kills + ' vs away ' + away.kills);
      assert(live.crits === away.crits, 'crits diverged: live ' + live.crits + ' vs away ' + away.crits);
      assert(JSON.stringify(live.inventory) === JSON.stringify(away.inventory),
        'drops diverged.\n  live: ' + JSON.stringify(live.inventory) + '\n  away: ' + JSON.stringify(away.inventory));
      /* The dial itself: away pays 1.00x, not 0.9x, not 1.1x. */
      assert(C.away.AWAY_RATE_MULT === 1.00, 'AWAY_RATE_MULT must be exactly 1.00, found ' + C.away.AWAY_RATE_MULT);
    } finally {
      window.getBonus = origBonus;
      C.randomSeed();
      restoreG(snap);
    }
  }),

  /* ── AWAY-1b: THE SAME CONTRACT, WITH AUTO-EAT IN THE LOOP ────────────────
     AWAY-1 above runs on an EMPTY bag, so `fx.autoEat` decides nothing and the
     parity it proves is parity of the fight. Since the 2026-08-31 ruling the
     chooser is a three-branch rule reading `raw`, `v` and the DEFICIT off the
     catalogue, and it runs INSIDE the seeded loop — a path that chose a
     different food would heal by a different amount and every later roll would
     diverge. So the family gets an arm rather than a fork: the same rig, the
     same seed, a bag with a real choice in it, and the INVENTORY comparison
     (which stacks were drained, food by food) is the assertion.

     The 95% trigger is not decoration: the largest Provision heals 50, so at
     the default 50% a 60 HP character is 30 HP down and only the top of the
     ladder covers it — the cheap branch would never fire and this arm would be
     AWAY-1 again with extra steps. The server-side twin of this assertion is
     `AUTO-EAT MIXED-BAG PARITY` in tests/accrual-engine.mjs. */
  () => tryRun('AWAY-1b PARITY: with auto-eat ON, live and away drain the SAME stacks out of the same bag', () => {
    const G = window.G;
    const C = window.HearthriseCore;
    const P = window.HearthrisePresence;
    const A = window.HearthriseAuto;
    if (!A || typeof A.getEat !== 'function') return;
    const snap = snapshotG();
    const origBonus = window.getBonus;
    const beforeEat = A.getEat();
    let wasParked = false;
    try {
      wasParked = (typeof A._parkEatSync === 'function') ? A._parkEatSync(true) : false;
      window.getBonus = () => 0;
      G.buffs = [];
      /* Real catalogue rows, chosen so the ladder has rungs: a 900 g Cooked
         Shark (the biggest healer, and what the PRE-ruling rule ate every
         time), a 240 g Lobster, a 55 g Trout, an 18 g Shrimp. */
      const BAG = { cooked_shark: 400, cooked_lobster: 400, cooked_trout: 400, cooked_shrimp: 400 };
      const run = (away) => {
        G.skills = Object.assign({}, G.skills, { attack: 40000, strength: 40000, hitpoints: 15000, defense: 15000 });
        G.activeMonster = 'goblin';
        const m = window.MONSTERS.goblin;
        G.monsterHp = m.hp; G.monsterMaxHp = m.hp;
        G.playerMaxHp = 60; G.playerHp = 60;
        G.gold = 0;
        G.inventory = Object.assign({}, BAG);
        G.traits = Object.assign({}, G.traits, { auto_eat: true, auto_eat_2: true });
        G.stats = Object.assign({}, G.stats, { kills: 0, crits: 0, deaths: 0, rareDrops: 0 });
        G.quests = [];
        A.setEat({ enabled: true, threshold: 0.95, foodId: null });
        /* b515 — MEASURE ONE THING, NOT TWO. This read `xpMap()` (the DISPLAY
           ladder: the server's map plus this session's predictions) as `before`
           and raw `G.skills` as `after`. That was harmless while the suite ran
           client-authoritative — `addXp` wrote `G.skills` and no prediction
           existed — and it inverted the moment the b353 kill switch was retired:
           `skills` is SERVER-OF-RECORD and ARMED, so a kill's XP is a PREDICTION
           and never a write to `G.skills`. The LIVE run left its predictions on
           the books, the AWAY run's `before` read them and its `after` did not,
           and the contract assertion reported the away path short by exactly the
           live run's payout — a false red accusing the away path of the one
           crime this test exists to detect.
           Both ends now read the DISPLAY, which is what the client actually
           produces under the arm and what the player is shown, and the ledger is
           zeroed at the top of each run so the two runs cannot contaminate each
           other. `goldOf()` is the same fix for gold, for the same reason. */
        predZero();
        const xpBefore = xpMap();
        const goldBefore = goldOf();
        C.reseed(0xC0FFEE);
        const body = () => {
          const ctx = window.HearthriseCombatSim.ctx();
          for (let i = 0; i < 240; i++) {
            if (!G.activeMonster) break;
            C.combatSim.simulateTick(G, ctx);
          }
        };
        if (away) P._withOfflineReplay(body); else body();
        const xpAfter = xpMap();
        const xp = {};
        Object.keys(xpAfter).forEach((k) => { const d = (xpAfter[k] || 0) - (xpBefore[k] || 0); if (d) xp[k] = d; });
        const ate = {};
        Object.keys(BAG).forEach((id) => {
          const gone = BAG[id] - (Number(G.inventory[id]) || 0);
          if (gone > 0) ate[id] = gone;
        });
        return { gold: goldOf() - goldBefore, kills: G.stats.kills, crits: G.stats.crits, xp, ate };
      };

      const live = run(false);
      const away = run(true);

      assert(live.kills > 0, 'the rig produced no kills — the parity assertion would be vacuous');
      const mealCount = Object.values(live.ate).reduce((s, n) => s + n, 0);
      assert(mealCount > 0,
        'auto-eat never fired, so this arm is AWAY-1 with a fuller bag: ' + JSON.stringify(live.ate));
      assert(JSON.stringify(live.ate) === JSON.stringify(away.ate),
        'the SAME seeded fight drained different stacks live vs away — the chooser is not one rule.\n'
        + '  live: ' + JSON.stringify(live.ate) + '\n  away: ' + JSON.stringify(away.ate));
      assert(JSON.stringify(live.xp) === JSON.stringify(away.xp),
        'XP DIVERGED with auto-eat on.\n  live: ' + JSON.stringify(live.xp) + '\n  away: ' + JSON.stringify(away.xp));
      assert(live.gold === away.gold, 'gold diverged: live ' + live.gold + ' vs away ' + away.gold);
      assert(live.kills === away.kills, 'kills diverged: live ' + live.kills + ' vs away ' + away.kills);
      assert(live.crits === away.crits, 'crits diverged: live ' + live.crits + ' vs away ' + away.crits);
      /* AND THE RULING ACTUALLY BIT. Without this the two runs could agree by
         both eating the Cooked Shark every time, which is the behaviour the
         ruling replaced. */
      assert(!live.ate.cooked_shark || Object.keys(live.ate).length > 1,
        'every meal was the biggest healer in the bag (' + JSON.stringify(live.ate) + ') — the '
        + 'cheapest-sufficient branch is not reading the deficit');
    } finally {
      window.getBonus = origBonus;
      C.randomSeed();
      A.setEat(beforeEat);
      if (typeof A._resetEatSync === 'function') A._resetEatSync();
      if (typeof A._parkEatSync === 'function') A._parkEatSync(wasParked);
      restoreG(snap);
    }
  }),

  /* ── AUTOEAT-FOOD-1: THE ORDER, THROUGH THE LIVE CLIENT ───────────────────
     The rule is unit-tested against the real catalogue in
     tests/accrual-engine.mjs. What THAT cannot see is the client ADAPTER:
     `maybeAutoEat()` has to hand `resolveAutoEat` the hp/maxHp pair the deficit
     is computed from, and an adapter that passed a stale or absent maxHp would
     silently drop the whole cheap branch while every unit assertion stayed
     green. So this drives the shipped path on a live `G` and reads the bag. */
  () => tryRun('AUTOEAT-FOOD-1: with no food nominated, the client eats the CHEAPEST food that heals to full — not the biggest', () => {
    const G = window.G;
    const A = window.HearthriseAuto;
    const AE = window.HearthriseCore && window.HearthriseCore.autoEat;
    if (!A || !AE) return;
    const snap = snapshotG();
    const beforeEat = A.getEat();
    let wasParked = false;
    try {
      wasParked = (typeof A._parkEatSync === 'function') ? A._parkEatSync(true) : false;
      /* THE ORDER, on producer-real rows. Named expects, so a reworded rule
         cannot pass by accident:
           shrimp           heals 3,  v 5,   RAW  (Cooking's own input)
           cooked_wolf_meat heals 6,  v 12        (processed, dearer, WINS)
           cooked_shrimp    heals 8,  v 18
           cooked_shark     heals 44, v 900       (the pre-ruling answer) */
      const I = window.ITEMS;
      assert(I.shrimp.raw === true && I.shrimp.v === 5 && I.cooked_wolf_meat.v === 12,
        'the fixture rows moved — this test is no longer about what it says it is about');
      assert(AE.chooseFood(null, { shrimp: 9, cooked_wolf_meat: 9 }, I, 3) === 'cooked_wolf_meat',
        'a RAW Provision was eaten while a processed one covered the same deficit');
      assert(AE.chooseFood(null, { cooked_shark: 9, cooked_shrimp: 9 }, I, 5) === 'cooked_shrimp',
        'the chooser did not take the cheapest Provision that heals to full');
      assert(AE.chooseFood(null, { cooked_shark: 9, cooked_shrimp: 9 }, I, 30) === 'cooked_shark',
        'with nothing able to heal to full the chooser must fall back to the BIGGEST healer');

      /* AND THE ADAPTER. A live 60 HP character, 5 HP down, holding both. */
      G.traits = Object.assign({}, G.traits, { auto_eat: true, auto_eat_2: true });
      G.playerMaxHp = 60; G.playerHp = 55;
      G.inventory = { cooked_shark: 4, cooked_shrimp: 4 };
      G.combatLog = [];
      A.setEat({ enabled: true, threshold: 0.95, foodId: null });
      const ate = A.maybeAutoEat();
      assert(ate === true, 'the client refused to auto-eat a 5 HP deficit at a 95% trigger');
      assert(G.inventory.cooked_shrimp === 3 && G.inventory.cooked_shark === 4,
        'the client ate the wrong stack — it must spend the 18 g Cooked Shrimp, not the 900 g Cooked '
        + 'Shark, on a 5 HP hole: ' + JSON.stringify(G.inventory));
      assert(G.playerHp === 60, 'the cheap food must still heal to FULL — that is what makes this free: '
        + G.playerHp);

      /* ── A FULL BAR CONSUMES NOTHING (Designer ruling 2c, 2026-08-31) ────
         The unit gates live in tests/accrual-engine.mjs; this is the half only
         the shipped client can prove — that the ADAPTER's apply step never
         runs, so no stack is decremented. The bug it closes is the tier-II
         ceiling turning `hp/maxHp <= 1` into one destroyed Provision per swing
         at full health, ~1,400 times a night, for 0 HP.
         CONTROL FIRST, deliberately: a guard that simply stopped auto-eating
         altogether must fail here rather than pass by doing nothing. */
      G.playerHp = 59; G.inventory = { cooked_shrimp: 4 };
      A.setEat({ enabled: true, threshold: 1 });
      assert(A.maybeAutoEat() === true && G.inventory.cooked_shrimp === 3,
        'CONTROL: a 1 HP deficit at a 100% trigger did not eat — the deficit guard has broken the '
        + 'max-safety setting instead of the zero-deficit case: ' + JSON.stringify(G.inventory));
      G.playerHp = 60; G.inventory = { cooked_shrimp: 4 };
      assert(A.maybeAutoEat() === false,
        'the client auto-ate at FULL health against a 100% trigger — the dial says "eat when my HP '
        + 'drops to X%", and a full bar has not dropped to anything (ruling 2c)');
      assert(G.inventory.cooked_shrimp === 4,
        'a full-health auto-eat consumed a Provision for 0 HP restored: ' + JSON.stringify(G.inventory));

      /* …and the dial's top end says what the setting now means. */
      const S = window.HearthriseSettingsPage;
      if (S && typeof S._autoEatHint === 'function') {
        const top = S._autoEatHint(true, 1, '');
        assert(/eat the moment I take any damage/i.test(top),
          'the 100% end of the dial does not say what the setting now does: ' + top);
        assert(!/will not heal while away/i.test(top),
          'the 100% end wears the 0% end\'s warning — the ruling rejected copy as a substitute for '
          + 'the engine fix, and there is no consequence left to warn about: ' + top);
      }
    } finally {
      A.setEat(beforeEat);
      if (typeof A._resetEatSync === 'function') A._resetEatSync();
      if (typeof A._parkEatSync === 'function') A._parkEatSync(wasParked);
      restoreG(snap);
    }
  }),

  () => tryRun('AWAY-2: an away kill grants m.xp (the ~21% of combat XP the second loop never paid)', () => {
    const G = window.G;
    const C = window.HearthriseCore;
    const P = window.HearthrisePresence;
    const snap = snapshotG();
    try {
      const m = window.MONSTERS.goblin;
      /* ⚠ THE EXPECTATION IS THE LIVE KILL, NOT ARITHMETIC. `gained >= floor(pacedXp('attack',
         m.xp))` assumes the grant lands in ONE skill; killXpRoute splits it and floors each share,
         paying 3 on a three-way melee route where that predicts 5, and it only passed because the
         record leak fixed above forced the one-skill RANGED route. The kill played LIVE is the
         route-proof oracle. */
      const runKill = (away) => {
        G.activeMonster = 'goblin';
        G.monsterHp = 1; G.monsterMaxHp = m.hp;
        G.playerMaxHp = 60; G.playerHp = 60;
        G.skills = Object.assign({}, G.skills, { attack: 0, strength: 0, hitpoints: 0, defense: 0 });
        /* IDENTICAL STARTING STATE (the AWAY-1 rig's rule) — the hundred-kill quest
           and a leftover knockout each pay one run and not the other. */
        G.quests = [];
        onFeet();
        predZero();
        const before = xpMap();
        const body = () => { window.killMonster(m); };
        if (away) P._withOfflineReplay(body); else body();
        const after = xpMap();
        return Object.keys(after).reduce((s, k) => s + Math.max(0, (after[k] || 0) - (before[k] || 0)), 0);
      };
      const liveGain = runKill(false);
      const awayGain = runKill(true);
      assert(liveGain > 0,
        'the LIVE kill paid nothing — the comparison below would be vacuous (the rig is broken, not the away path)');
      assert(awayGain === liveGain,
        'an away kill paid ' + awayGain + ' XP where the same kill played live paid ' + liveGain
        + '. m.xp is the ~21% of combat XP the retired second loop never granted; away and live '
        + 'run one engine and must route a kill identically.');
    } finally { restoreG(snap); }
  }),

  () => tryRun('AWAY-3: crits roll away, increment stats.crits, and the damage_crit food buff now REACHES an away roll', () => {
    const G = window.G;
    const C = window.HearthriseCore;
    const P = window.HearthrisePresence;
    const snap = snapshotG();
    const origBonus = window.getBonus;
    try {
      /* (a) crits happen away at all. Force every chance roll to succeed by
         injecting a generator, which is only possible because randomness is a
         seam — the old `Math.random = () => 0` trick could not prove this. */
      window.getBonus = (k) => (k === 'crit' ? 1 : 0);
      G.buffs = [];
      G.activeMonster = 'goblin';
      const m = window.MONSTERS.goblin;
      G.monsterHp = m.hp * 20; G.monsterMaxHp = m.hp * 20;   // survive the swing so we read the crit, not a kill
      G.playerMaxHp = 200; G.playerHp = 200;
      G.skills = Object.assign({}, G.skills, { attack: 40000, strength: 40000 });
      G.stats = Object.assign({}, G.stats, { crits: 0 });
      C.setRng({ next: () => 0, int: (a) => a, chance: () => true });
      P._withOfflineReplay(() => {
        C.combatSim.simulateTick(G, window.HearthriseCombatSim.ctx());
      });
      assert(G.stats.crits === 1, 'an away crit must increment stats.crits, got ' + G.stats.crits);

      /* (b) THE ONE PLACE THE CRIT RULE AND THE BUFF RULE MEET, and the
         assertion is now the opposite of what b326 shipped.
         b326: crit applies away because it is gear, and the damage_crit FOOD
         buff does not, because it is a BUFF and the buff channel was closed.
         The channel is open now (src/core/away.js — the line is server-wide vs
         personal, and a Feast is personal), so the food buff reaches an away
         crit roll exactly as it reaches a live one. Still no special case in
         either direction — which is the property worth having, given the rule
         underneath it moved. Read through the real chain, not a stub. */
      window.getBonus = origBonus;
      G.buffs = [];
      const baseCrit = window.getBonus('crit');
      G.buffs = [{ type: 'damage_crit', magnitude: 50, remainingMs: 600000, addedAt: Date.now() }];
      const liveCrit = window.getBonus('crit');
      let awayCrit = null;
      P._withOfflineReplay(() => { awayCrit = window.getBonus('crit'); });
      assert(liveCrit >= baseCrit + 0.5, 'a +50% damage_crit buff must pay while playing, got ' + liveCrit + ' over a base of ' + baseCrit);
      assert(awayCrit === liveCrit,
        'the damage_crit FOOD buff must reach an away crit roll identically (live ' + liveCrit + ', away ' + awayCrit + ')');
      /* …and it is not free. The half that makes paying honest is spending:
         once the absence has run the buff out it stops contributing, which
         AWAY-5 measures on a real timeline. Asserted here only as the
         boundary — a dead buff pays nothing, away or live. */
      G.buffs = [{ type: 'damage_crit', magnitude: 50, remainingMs: 0, addedAt: Date.now() }];
      let spentCrit = null;
      P._withOfflineReplay(() => { spentCrit = window.getBonus('crit'); });
      assert(spentCrit === baseCrit,
        'a buff the absence has already spent must pay nothing away, got ' + spentCrit + ' against a base of ' + baseCrit);
    } finally {
      window.getBonus = origBonus;
      C.setRng(null);
      restoreG(snap);
    }
  }),

  () => tryRun('AWAY-4: Boss of the Day pays away, and an absence crossing UTC midnight pays each day its own boss', () => {
    const C = window.HearthriseCore;
    const M = window.MONSTERS;
    assert(C.botd && typeof C.botd.botdFor === 'function', 'botdFor(atMs) must exist as a pure function of time');

    /* Determinism first: the same instant always resolves to the same boss,
       and a stated day key resolves the same as any instant inside that day. */
    const noonJan1 = Date.UTC(2026, 0, 1, 12, 0, 0);
    const elevenPmJan1 = Date.UTC(2026, 0, 1, 23, 0, 0);
    const oneAmJan2 = Date.UTC(2026, 0, 2, 1, 0, 0);
    const a = C.botd.botdFor(noonJan1, M);
    const b = C.botd.botdFor(elevenPmJan1, M);
    assert(a.dailyId && a.dailyId === b.dailyId, 'two instants in the same UTC day must resolve to the same boss');
    assert(M[a.dailyId], 'the featured boss must be a real monster: ' + a.dailyId);

    /* The card and the core must not disagree — that identity is what makes
       the extraction safe. */
    assert(window.HearthriseBossOfDay.featuredId('2026-1-1') === a.dailyId,
      'the Combat card and the core rotation resolved DIFFERENT bosses for the same day');

    /* Segment resolution: an absence spanning midnight is two segments, and
       the two days need not (and here do not) share a boss. */
    const segs = C.away.utcDaySegments(elevenPmJan1, oneAmJan2);
    assert(segs.length === 2, 'a 2h absence across UTC midnight must be TWO segments, got ' + segs.length);
    assert(segs[0].ms === 3600000 && segs[1].ms === 3600000, 'each segment must carry its own hour');
    const day2 = C.botd.botdFor(oneAmJan2, M);
    assert(day2.dailyId, 'the second day must also resolve a boss');
    /* The important claim is per-segment RESOLUTION, not that the two ids
       differ (a hash may collide). Assert resolution explicitly. */
    assert(C.botd.utcDayKey(elevenPmJan1) !== C.botd.utcDayKey(oneAmJan2),
      'the two segments must fall on different UTC day keys');

    /* And the bonus is real, at an instant, for the boss of THAT instant. */
    const feat = C.botd.killBonusesFor(a.dailyId, noonJan1, M);
    assert(feat.dropMult > 1 && feat.xpMult > 1, 'the featured boss must pay a drop + XP lift at its own instant');
    const notFeat = C.botd.killBonusesFor('slime', noonJan1, M);
    assert(notFeat.dropMult === 1 && notFeat.xpMult === 1, 'an unfeatured monster must pay 1x');
  }),

  () => tryRun('AWAY-4b: an away kill on the featured boss actually applies the lift (BotD is not presence-gated)', () => {
    const G = window.G;
    const C = window.HearthriseCore;
    const P = window.HearthrisePresence;
    const snap = snapshotG();
    const origBonus = window.getBonus;
    try {
      window.getBonus = () => 0;
      G.buffs = [];
      const featuredId = window.HearthriseBossOfDay.featuredId();
      assert(featuredId && window.MONSTERS[featuredId], 'no featured boss today — cannot assert the lift');
      const m = window.MONSTERS[featuredId];
      const xpOf = (away) => {
        G.activeMonster = featuredId;
        G.monsterHp = 1; G.monsterMaxHp = m.hp;
        G.playerHp = 500; G.playerMaxHp = 500;
        G.skills = Object.assign({}, G.skills, { attack: 0, strength: 0, hitpoints: 0, defense: 0, magic: 0, ranged: 0 });
        const before = xpMap();
        C.reseed(1234);
        const body = () => window.killMonster(m);
        if (away) P._withOfflineReplay(body); else body();
        const after = xpMap();
        return Object.keys(after).reduce((s, k) => s + Math.max(0, (after[k] || 0) - (before[k] || 0)), 0);
      };
      const awayXp = xpOf(true);
      const liveXp = xpOf(false);
      assert(awayXp > 0 && awayXp === liveXp,
        'a featured-boss kill must pay the SAME lifted XP away as live (away ' + awayXp + ', live ' + liveXp + ')');
      /* And prove the lift is present at all, by comparing against a plain foe
         scaled to the same base xp — cheapest honest proof is the multiplier. */
      const feat = C.botd.killBonusesFor(featuredId, Date.now(), window.MONSTERS);
      assert(feat.xpMult > 1, 'today\'s featured boss must carry an XP multiplier');
    } finally {
      window.getBonus = origBonus;
      C.randomSeed();
      restoreG(snap);
    }
  }),

  () => tryRun('AWAY-5: a timed buff PAYS away and DRAINS away — 5 minutes of Feast covers 5 minutes of an hour, then stops', () => {
    const G = window.G;
    const C = window.HearthriseCore;
    const P = window.HearthrisePresence;
    const snap = snapshotG();
    try {
      /* ── THE RULE THIS ASSERTS, AND WHY IT REPLACED THE OLD ONE ───────────
         b326 FROZE a buff for the whole absence: it neither paid nor drained,
         and this test asserted exactly that. The line it drew was timed vs
         permanent. The real line is SERVER-WIDE vs PERSONAL (Tyler,
         2026-08-14: "should not gain the server wide blessing/buffs but they
         should still get their personal / clan buffs"), and a Feast the player
         ate is personal, so it pays.

         Which makes the DRAIN load-bearing rather than tidy. "Pays away"
         without "spends away" is a strictly worse exploit than the one b326
         closed — ten minutes of consumable would cover a twelve-hour night. So
         this test measures both halves on a real timeline, and it measures
         WHERE the buff ran out: not at the start (a nerf), not at the end (a
         mint), but at the five-minute mark. Coverage is the assertion. */
      const m = window.MONSTERS.goblin;
      const setup = () => {
        G.skills = Object.assign({}, G.skills, { attack: 50000, strength: 50000, hitpoints: 20000, defense: 20000 });
        G.activeMonster = 'goblin';
        G.monsterHp = m.hp; G.monsterMaxHp = m.hp;
        G.playerMaxHp = 5000; G.playerHp = 5000;
      };
      const foodId = 'cooked_shrimp';
      G.inventory = Object.assign({}, G.inventory); G.inventory[foodId] = 5;
      const tickMs = window.combatTickMs();

      /* (a) IT PAYS, and it pays the SAME away as live. Measured against the
         player's own base so a drop-rate perk cannot make this vacuous. */
      G.buffs = [];
      const baseDrop = window.getBonus('dropRate');
      G.buffs = [{ type: 'drop_rate', magnitude: 100, remainingMs: 300000, addedAt: Date.now() }];
      const liveDrop = window.getBonus('dropRate');
      assert(liveDrop >= baseDrop + 1, 'a +100% drop_rate buff must pay while playing, got ' + liveDrop + ' over a base of ' + baseDrop);
      let awayDrop = null;
      P._withOfflineReplay(() => { awayDrop = window.getBonus('dropRate'); });
      assert(awayDrop === liveDrop,
        'a PERSONAL buff must pay the same away as live (live ' + liveDrop + ', away ' + awayDrop + ')');

      /* (b) …AND ONE HOUR OF ABSENCE SPENDS EXACTLY THE FIVE MINUTES IT HAD. */
      setup();
      G.buffs = [{ type: 'drop_rate', magnitude: 100, remainingMs: 300000, addedAt: Date.now() }];
      let s = null;
      P._withOfflineReplay(() => { s = window.simulateAwayCombat(1, Date.now(), false); });
      assert(s && s.ticks > 0, 'the rig produced no ticks — every assertion below would be vacuous');
      assert(s.died === false, 'the rig died mid-span; the coverage measurement below would be measuring the death, not the buff');
      assert(Math.abs(s.buffPaidMs - 300000) <= tickMs,
        'a 5-minute buff must pay 5 minutes of a 1-hour absence, got ' + s.buffPaidMs + 'ms (one tick = ' + tickMs + 'ms)');
      assert(s.buffPaidMs < 3600000,
        'THE MINT: the buff paid ' + s.buffPaidMs + 'ms of a 3600000ms absence — a 5-minute consumable must not cover an hour');
      assert(s.buffsExpired.indexOf('drop_rate') >= 0,
        'the summary must name the buff that ran out mid-absence, got ' + JSON.stringify(s.buffsExpired));
      assert(G.buffs.length === 0,
        'the expired buff must be pruned — tickBuffs skips an already-dead entry, so nothing else would ever clear the "0s" row');
      assert(window.getBonus('dropRate') === baseDrop,
        'a spent buff must pay nothing afterwards, got ' + window.getBonus('dropRate') + ' against a base of ' + baseDrop);
      assert(G.inventory[foodId] === 5, 'an away buff must not consume extra food, found ' + G.inventory[foodId]);

      /* (c) THE OTHER HALF: a buff LONGER than the absence survives it, minus
         exactly the time that passed. Frozen and drained-to-zero are both
         wrong, and only measuring the expiry case would miss either. */
      setup();
      G.buffs = [{ type: 'drop_rate', magnitude: 100, remainingMs: 3600000, addedAt: Date.now() }];
      P._withOfflineReplay(() => { window.simulateAwayCombat(0.25, Date.now(), false); });
      assert(G.buffs.length === 1, 'a buff longer than the absence must survive it');
      const spent = 3600000 - G.buffs[0].remainingMs;
      assert(Math.abs(spent - 900000) <= tickMs,
        'a 15-minute absence must spend 15 minutes of a 60-minute buff, spent ' + spent + 'ms');
      assert(window.getBonus('dropRate') >= baseDrop + 1,
        'and the remainder must still be paying when the player gets back');

      /* (d) THE LAST FREEZE IS GONE (wall-clock ruling, 2026-09-13). This arm
         asserted the opposite until today. The authority is an ABSOLUTE `until` the
         server keeps expiring whether the player fights, idles or sleeps, and the
         freeze was CLIENT-ONLY (every engine caller passes `active: true`) — a
         promise only the pill made, and the server was already breaking it. */
      G.activeMonster = null; G.activeSkill = null; G.activeArtisanRecipe = null;
      const before = G.buffs[0].remainingMs;
      window.advanceBuffClock(60000);
      assert(G.buffs[0].remainingMs === before - 60000,
        'an IDLE minute must drain the buff by a minute — the clock is wall-clock against the server\'s '
        + 'absolute `until`, found ' + G.buffs[0].remainingMs + ' vs ' + (before - 60000));
      G.activeSkill = 'woodcutting'; G.skillTargetId = 'normal_tree';
      window.advanceBuffClock(60000);
      assert(G.buffs[0].remainingMs === before - 120000,
        'and a WORKING minute costs the same minute — one rule, not two: '
        + G.buffs[0].remainingMs + ' vs ' + (before - 120000));
    } finally { C.randomSeed(); restoreG(snap); }
  }),

  /* AWAY-5b — THE FIXTURE'S CEILING, AND THE REAL BUG BEHIND IT. AWAY-5 stands a 5,000 HP rig up
     for an hour and asserts `died === false`; a hitpoints level-up in the span ran a bare
     `G.playerMaxHp = ev.to`, cut the ceiling to 35, and killed it at tick 991 of 1000. playerMaxHp
     is projected from player_state.max_hp and may sit above the bare level — hrSyncMaxHp is
     raise-only for that reason, and lowering it is the client rolling a server value back. */
  () => tryRun('AWAY-5b: a hitpoints level-up RAISES max HP and never lowers it — the client cannot roll back a server-projected ceiling', () => {
    const G = window.G;
    const snap = snapshotG();
    try {
      if (typeof window.addXp !== 'function') { skip('addXp is not exposed'); return; }
      G.skills = Object.assign({}, G.skills, { hitpoints: 0 });
      stampRecordLikeLoad(G);          // so the display has a base to level FROM
      G.playerMaxHp = 500; G.playerHp = 500;
      const ceilingBefore = G.playerMaxHp;
      window.addXp('hitpoints', 100000, { authored: true });
      assert(G.playerMaxHp >= ceilingBefore,
        'a hitpoints level-up CUT max HP from ' + ceilingBefore + ' to ' + G.playerMaxHp
        + '. G.playerMaxHp is projected from player_state.max_hp and may sit above the bare '
        + 'hitpoints level; a level-up may only ever RAISE it, exactly as hrSyncMaxHp does.');
      /* The raise half is still real, so this cannot pass with the write deleted. */
      G.playerMaxHp = 1; G.playerHp = 1;
      G.skills = Object.assign({}, G.skills, { hitpoints: 0 });
      stampRecordLikeLoad(G);
      window.addXp('hitpoints', 100000, { authored: true });
      assert(G.playerMaxHp > 1,
        'a hitpoints level-up must still RAISE a ceiling that is below the new level, got ' + G.playerMaxHp);
    } finally { restoreGAndRecord(snap); }
  }),

  /* AWAY-16 IS RETIRED (b515), and its own header says why in advance: "this
     drives the REAL window.processOffline() — not a core primitive — because
     the defect was in the caller that owns no timeline, and a core-level test
     cannot see a caller."

     THAT CALLER IS DELETED. processOffline's gather and artisan branches — the
     flat `ticks = floor(spanMs / interval)` loops with nothing advancing a
     clock inside them, which paid a ten-minute consumable for a whole night —
     went with the rest of the local away engine in b515. There is no second
     implementation of the gather loop for a timeline to be missing from: the
     ONE loop is `src/core/skill-sim.js simulateSkillSpan`, and it slices
     (`sliceSpan`, `MAX_SLICES`, `resolveStepMs`) and drains per slice.

     THE PROPERTY IS COVERED, on the engine that replaced the caller, by
     `gatherBuffTimelineGuard` in tests/accrual-engine.mjs — which measures the
     SAME fixture this test did (8h on Normal Tree with one 10-minute +4% speed
     buff) against the same numbers (6,250 dishonest actions vs ~6,005 honest
     ones) and additionally asserts the buff came back drained. It runs in Node
     against the vendored engine, so it is watching the bytes hr-accrue runs
     rather than a client copy of them. AWAY-15 above pins the same timeline for
     the COMBAT span, in pure core, and is untouched. */

  () => tryRun('AWAY-17: nextBuffExpiryMs is the ONE boundary oracle — it agrees with activeBuffs and cannot hang the replay', () => {
    const C = window.HearthriseCore;
    const B = C.buffs;
    assert(typeof B.nextBuffExpiryMs === 'function',
      'the away replay reads its slice boundaries from core; without this it silently degrades to the flat loop that caused b347');
    /* NO BUFF, NO BOUNDARY. `Infinity` rather than null/0 so the caller can
       write `Math.min(remaining, boundary)` with no special case — and a 0
       would be a slice of zero length, i.e. an infinite loop. */
    assert(B.nextBuffExpiryMs([]) === Infinity, 'an empty queue must have no boundary');
    assert(B.nextBuffExpiryMs(null) === Infinity, 'a missing queue must have no boundary');
    assert(B.nextBuffExpiryMs([{ type: 'all_xp', magnitude: 1, remainingMs: 0 }]) === Infinity,
      'a dead buff must not produce a boundary — the slice would be zero-length');
    /* THE SOONEST, not the first or the last. */
    assert(B.nextBuffExpiryMs([
      { type: 'all_xp', magnitude: 1, remainingMs: 900000 },
      { type: 'gather_speed', magnitude: 1, remainingMs: 120000 },
      { type: 'drop_rate', magnitude: 1, remainingMs: 400000 },
    ]) === 120000, 'the boundary must be the SOONEST expiry');
    /* IT MUST AGREE WITH WHAT PAYS. `activeBuffs` filters on a KNOWN type, so a
       junk row in a save must not create a boundary — a slice that changes no
       bonus is a segment paid twice, which is exactly the class of bug the
       split exists to remove. */
    const junk = [{ type: 'not_a_real_buff_type', magnitude: 99, remainingMs: 1000 }];
    assert(B.activeBuffs(junk).length === 0, 'the rig is wrong: this type must be unknown');
    assert(B.nextBuffExpiryMs(junk) === Infinity,
      'an unknown buff type paid nothing, so it must not move the boundary either');
    /* HOSTILE NUMBERS MUST NOT PRODUCE A ZERO-LENGTH OR NEGATIVE SLICE. */
    [NaN, Infinity, -1, -0, undefined, null, '600000'].forEach((v) => {
      const r = B.nextBuffExpiryMs([{ type: 'all_xp', magnitude: 1, remainingMs: v }]);
      assert(r === Infinity || (isFinite(r) && r > 0),
        'remainingMs=' + String(v) + ' produced boundary ' + r + ' — a non-positive or infinite boundary hangs the replay');
    });
    /* AND `hasActiveBuff` must answer the same question `activeBuffs` does —
       simulateSpan asks it ~12,000 times a night and the two must not drift. */
    [[], [{ type: 'all_xp', magnitude: 1, remainingMs: 5 }],
      [{ type: 'all_xp', magnitude: 1, remainingMs: 0 }], junk].forEach((q) => {
      assert(B.hasActiveBuff(q) === (B.activeBuffs(q).length > 0),
        'hasActiveBuff disagreed with activeBuffs on ' + JSON.stringify(q));
    });
  }),

  () => tryRun('AWAY-6: blessings still contribute 0 away (the b227 latch is unchanged by the unification)', () => {
    const P = window.HearthrisePresence;
    const E = window.HearthriseWorldEvents;
    assert(P.blessingsApply() === true, 'an online player outside a replay must be blessed');
    let inside = null;
    P._withOfflineReplay(() => { inside = P.blessingsApply(); });
    assert(inside === false, 'blessings must not apply inside an away replay');
    assert(P.blessingsApply() === true, 'and the latch must release afterwards');
    /* The channel table must agree with the latch — two rules for one question
       is how the away/live split drifted the first time. */
    const A = window.HearthriseCore.away;
    assert(A.channelApplies('blessing', { away: true }) === false, 'the blessing channel must be closed away');
    /* THE LINE IS SERVER-WIDE vs PERSONAL, not timed vs permanent. A blessing
       is something the world does for people who are in it; a Feast is
       something the player did to their own character, and it stays true while
       they sleep. So blessing is closed and buff is OPEN — and because it is
       open it also drains (AWAY-5 measures that half). */
    assert(A.channelApplies('buff', { away: true }) === true, 'the buff channel must be OPEN away — personal buffs pay while you are gone');
    assert(A.channelApplies('permanent', { away: true }) === true, 'permanent bonuses must always apply');
    assert(A.channelApplies('crit', { away: true }) === true, 'crit must always apply');
    assert(A.channelApplies('botd', { away: true }) === true, 'Boss of the Day must apply away');
    assert(A.channelApplies('heal', { away: true }) === true, 'healing auto-eat must apply away');
    /* An UNKNOWN channel defaults to paying. The five omissions the ruling
       fixes were all base rewards a second loop silently dropped, so "quietly
       missing" must never be the default for something new. */
    assert(A.channelApplies('a_channel_invented_next_year', { away: true }) === true,
      'an unknown bonus channel must default to APPLYING away, not to silently vanishing');
    if (E && typeof E.summaryFor === 'function') { /* pool wiring covered by the b227 suite */ }
  }),

  () => tryRun('AWAY-7: away kills feed the drop log, dailies, quests and rollKillDeed; an away death increments stats.deaths', () => {
    const G = window.G;
    const C = window.HearthriseCore;
    const P = window.HearthrisePresence;
    const snap = snapshotG();
    const seen = { recordKill: 0, daily: 0, quest: 0, deed: 0 };
    const realLog = window.HearthriseDropLog;
    const realFarm = window.HearthriseFarm;
    const realDaily = window.updateDaily;
    const realQuest = window.updateQuest;
    try {
      window.HearthriseDropLog = Object.assign({}, realLog, { recordKill: () => { seen.recordKill++; } });
      window.HearthriseFarm = Object.assign({}, realFarm, { rollKillDeed: () => { seen.deed++; } });
      window.updateDaily = function (t) { if (t === 'kill_any') seen.daily++; return realDaily.apply(this, arguments); };
      window.updateQuest = function (t) { if (t === 'kill_any' || t === 'kill_monster') seen.quest++; return realQuest.apply(this, arguments); };

      const m = window.MONSTERS.goblin;
      G.activeMonster = 'goblin';
      G.monsterHp = 1; G.monsterMaxHp = m.hp;
      G.playerHp = 100; G.playerMaxHp = 100;
      P._withOfflineReplay(() => { window.killMonster(m); });

      assert(seen.recordKill === 1, 'an away kill must reach HearthriseDropLog.recordKill (collection log under-reported every overnight)');
      assert(seen.daily === 1, 'an away kill must tick updateDaily("kill_any") — "Slay 10 monsters" made ZERO progress overnight');
      assert(seen.quest === 2, 'an away kill must tick both kill_any and kill_monster quests, got ' + seen.quest);
      assert(seen.deed === 1, 'an away kill must roll a Farmer\'s Deed');

      /* stats.deaths: never incremented ANYWHERE before this change — not away,
         not live. Assert both paths, because a rule that only holds in one is
         precisely the failure mode being deleted. */
      const dieOnce = (away) => {
        G.stats = Object.assign({}, G.stats);
        const before = G.stats.deaths || 0;
        G.activeMonster = 'goblin';
        G.monsterHp = m.hp; G.monsterMaxHp = m.hp;
        G.playerMaxHp = 100; G.playerHp = 1;
        const body = () => C.combatSim.resolveDeath(G, window.HearthriseCombatSim.ctx());
        if (away) P._withOfflineReplay(body); else body();
        return (G.stats.deaths || 0) - before;
      };
      assert(dieOnce(true) === 1, 'an AWAY death must increment stats.deaths');
      assert(dieOnce(false) === 1, 'a LIVE death must increment stats.deaths');
    } finally {
      /* THE LIVE HALF ABOVE IS A REAL DEATH, so it raises the real death sheet
         — a full-screen overlay that closes on a tap nobody in a suite gives
         it. Left up it covered every screen for the remaining ~370 tests
         (measured on b513). One teardown, the same one every fall fixture
         uses. */
      try { window.HearthriseDeathSheet.__resetForTest(); } catch (e) {}
      window.HearthriseDropLog = realLog;
      window.HearthriseFarm = realFarm;
      window.updateDaily = realDaily;
      window.updateQuest = realQuest;
      restoreG(snap);
    }
  }),

  () => tryRun('AWAY-8: the cap survives — 18h at a 12h cap grants exactly 12h, and a second absence the same day starts fresh (b307)', () => {
    const G = window.G;
    const snap = snapshotG();
    const realCap = window.offlineCapHours;
    try {
      window.offlineCapHours = () => 12;
      const now = Date.now();
      G.offlineBudget = { at: now - 18 * 3600000 };
      const first = window.claimOfflineMs(now, true, 60000);
      assert(Math.abs(first - 12 * 3600000) < 1000,
        'an 18h absence at a 12h cap must grant exactly 12h, got ' + (first / 3600000).toFixed(2) + 'h');
      /* PER-ABSENCE, not a daily bucket (b307). A second absence the same day
         is measured from the reset watermark and is capped on its own terms. */
      G.offlineBudget.at = now - 5 * 3600000;
      const second = window.claimOfflineMs(now, true, 60000);
      assert(Math.abs(second - 5 * 3600000) < 1000,
        'a SECOND absence the same day must start fresh (per-absence cap, no daily bucket), got ' + (second / 3600000).toFixed(2) + 'h');
      const third = window.claimOfflineMs(now, true, 60000);
      assert(third === 0, 'the watermark must have advanced — an immediate re-claim must grant nothing');
    } finally {
      window.offlineCapHours = realCap;
      restoreG(snap);
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     AWAY-22 / AWAY-23 — WHICH HOURS OF AN OVER-CAP ABSENCE GET PAID. (b352)

     Ruling 2 (Game Designer, 2026-08-15). AWAY-8 above pins HOW MUCH a capped
     absence pays; these pin WHICH hours those are, and they are a different
     question with a different answer — the credited window is the FIRST
     cap-hours after the player left, never the last cap-hours before they came
     back. Two live defects came out of the old anchor, and there is one test
     for each:

       AWAY-22  `simulateSpan` resolves the Boss of the Day per UTC-day SEGMENT
                of the credited window. Anchored to the RETURN instant, a player
                could choose which days paid by choosing when to open the tab —
                an 18h absence made to land wholly on the x1.5-drop day. Anchored
                to the DEPARTURE instant the segments are fixed the moment the
                tab closes, which is when the targeting decision was made.

       AWAY-23  a 10-minute Feast eaten on the way out is alive for minutes 0-10
                OF THE ABSENCE. Credit the last twelve hours of an eighteen-hour
                absence and those minutes are outside the window: the Feast is
                spent on forfeited time and pays nothing.

     Both drive the REAL `window.processOffline()`, because the anchor lives in
     the caller and a core-level test cannot see a caller. ══════════════════ */
  () => tryRun('AWAY-22: an over-cap absence is credited from when the player LEFT — the window, and the boss segments in it, start at the watermark', () => {
    /* THE EXPLOIT, restated because it is the reason this test is not just
       about tidiness: `simulateSpan` resolves the Boss of the Day per UTC-day
       SEGMENT of the credited window. Anchor that window to the RETURN instant
       and an 18h absence begun at 22:00 UTC can be made to land wholly on the
       next day's boss (x1.5 drops, x1.25 combat XP) by choosing when to open
       the tab — a free, self-selected multiplier on a tradeable-item faucet.

       b515 — DRIVEN ON THE TWO FUNCTIONS THAT DECIDE IT, not through
       `window.processOffline()`, whose local away engine is deleted. That is
       the same pair the Edge engine uses and in the same order: `creditWindow`
       chooses the hours, `utcDaySegments` cuts them into boss days, and
       `simulateSpan` is handed the result. Nothing here restates the
       arithmetic, so the assertion cannot agree with itself.
       MUTATION: restore `fromMs = toMs - spanMs` (or `now - grantMs` on the
       server) and windowFrom lands 6h later, on the return side of the
       absence — red on the second assertion and on every segment below it. */
    const C = window.HearthriseCore;
    const A = C.away;
    const CAP_MS = 12 * 3600000;
    const AWAY_MS = 18 * 3600000;
    /* 22:00 UTC on purpose: the departure and the return fall on DIFFERENT UTC
       days, so an anchor bug changes which boss pays and not merely a label. */
    const left = Date.UTC(2026, 0, 15, 22, 0, 0);
    const now = left + AWAY_MS;

    const w = A.creditWindow({ nowMs: now, watermarkMs: left, capMs: CAP_MS });
    assert(w.paidMs === CAP_MS,
      'an 18h absence at a 12h cap must still CREDIT 12h, got ' + (w.paidMs / 3600000).toFixed(2) + 'h');
    assert(w.fromMs === left,
      'the credited window must OPEN where the absence did (' + new Date(left).toISOString()
      + '), got ' + new Date(w.fromMs).toISOString());
    assert(w.toMs === left + CAP_MS, 'and close one cap later, got ' + new Date(w.toMs).toISOString());
    assert(w.unpaidMs === AWAY_MS - CAP_MS,
      'the forfeited tail must be the 6h the cap refused, got ' + (w.unpaidMs / 3600000).toFixed(2) + 'h');
    assert(w.capped === true, 'an 18h absence at a 12h cap must report itself capped');

    /* THE PART THAT IS AN EXPLOIT AND NOT A COSMETIC: the UTC-day segments the
       Boss of the Day is resolved against are cut from THIS window. Asserted
       twice — on `utcDaySegments` directly, and on the segments `simulateSpan`
       actually reports for the same window, because a span that cut its own
       days would satisfy the first and still ship the bug. */
    const dayOf = (ms) => Math.floor(ms / 86400000);
    const segs = A.utcDaySegments(w.fromMs, w.toMs);
    assert(segs.length >= 2,
      'the fixture must straddle UTC midnight or the exploit is not staged, got ' + segs.length + ' segment(s)');
    assert(segs[0].fromMs === left,
      'the first boss segment must begin when the player left, got ' + new Date(segs[0].fromMs).toISOString());
    assert(segs[segs.length - 1].toMs === w.toMs, 'and the last must end at the close of the credited window');
    const expected = [];
    for (let d = dayOf(w.fromMs); d <= dayOf(w.toMs - 1); d++) expected.push(d);
    assert(JSON.stringify(segs.map((x) => dayOf(x.fromMs))) === JSON.stringify(expected),
      'the credited window must be segmented over the UTC days it actually spans — expected '
      + JSON.stringify(expected) + ', got ' + JSON.stringify(segs.map((x) => dayOf(x.fromMs)))
      + '. A window anchored to the RETURN instant names later days, which lets return timing '
      + 'pick the Boss of the Day.');
    /* …and a window anchored to the return instant WOULD name different days.
       Without this the assertion above could be satisfied by any two adjacent
       days and the test would not be about the anchor at all. */
    const wrong = A.utcDaySegments(now - CAP_MS, now);
    assert(JSON.stringify(wrong.map((x) => dayOf(x.fromMs))) !== JSON.stringify(expected),
      'CONTROL: the return-anchored window names the same boss days as the departure-anchored one, so '
      + 'this fixture cannot tell the two apart');

    const r = awaySpan({ fromMs: w.fromMs, spanMs: w.paidMs });
    assert(r.out.ticks > 0, 'the span simulated nothing — the segment assertions below would be vacuous');
    const runSegs = r.out.segments || [];
    assert(JSON.stringify(runSegs.map((x) => dayOf(x.fromMs))) === JSON.stringify(expected),
      'simulateSpan cut its own day segments instead of the credited window\'s: '
      + JSON.stringify(runSegs.map((x) => dayOf(x.fromMs))) + ' vs ' + JSON.stringify(expected));
  }),

  () => tryRun('AWAY-23: a 10-minute buff eaten at logoff pays exactly 10 minutes of an 18h absence at a 12h cap — the forfeited time is the TAIL', () => {
    /* WHY THE TAIL MATTERS, and why this is a payout bug rather than a
       bookkeeping one: a timed buff eaten on the way out is alive for the FIRST
       minutes of the absence. Credit the LAST twelve hours of an eighteen-hour
       absence and those minutes fall outside the credited window entirely — the
       player pays for a consumable that buys nothing (measured: 10 minutes of
       coverage becomes 0).

       b515 — the fixture drove `window.processOffline()`; that engine is
       deleted, so it drives the pair that decides it, exactly as AWAY-22 does:
       `creditWindow` picks the hours and `simulateSpan` runs the buff clock
       over them. The buff queue lives on the plain state, so nothing here can
       be satisfied by an ambient `G.buffs` an earlier test left behind — which
       the old fixture could not say. */
    const A = window.HearthriseCore.away;
    const CAP_MS = 12 * 3600000;
    const AWAY_MS = 18 * 3600000;
    const BUFF_MS = 600000;
    const TICK = 2400;
    const left = Date.UTC(2026, 0, 15, 22, 0, 0);
    const now = left + AWAY_MS;
    const w = A.creditWindow({ nowMs: now, watermarkMs: left, capMs: CAP_MS });
    assert(w.paidMs === CAP_MS && w.fromMs === left, 'the fixture window is wrong: ' + JSON.stringify(w));

    const night = (buffs) => awaySpan({
      fromMs: w.fromMs, spanMs: w.paidMs, tickMs: TICK,
      state: { buffs: buffs.map((b) => Object.assign({ addedAt: left }, b)) },
    });

    /* THE CONTROL: with no buff held the payload must report zero coverage, so
       the measurement below is a measurement and not a default. */
    const ctrl = night([]);
    assert(ctrl.out.ticks > 0, 'the fixture simulated nothing');
    assert(ctrl.out.buffPaidMs === 0, 'no buff was held, so nothing may be reported as paid');

    const r = night([{ type: 'drop_rate', magnitude: 100, remainingMs: BUFF_MS }]);
    assert(Math.abs(r.out.buffPaidMs - BUFF_MS) <= TICK,
      'a 10-minute buff eaten at logoff must cover the first 10 minutes of the CREDITED window, got '
      + r.out.buffPaidMs + 'ms (one tick = ' + TICK + 'ms). 0 means the window was anchored to the '
      + 'return instant and the buff was spent on forfeited time.');
    assert(r.out.buffPaidMs < CAP_MS,
      'THE MINT: the buff paid ' + r.out.buffPaidMs + 'ms of a ' + CAP_MS + 'ms window');
    assert(r.state.buffs.length === 0,
      'the buff must be spent by the time the player is back, found ' + JSON.stringify(r.state.buffs));

    /* AND THE FORFEITED TAIL IS SPENT, NOT FROZEN — the half a "never drain
       past the cap" fix would break. The cap stops the PAYOUT; the character
       kept standing there, so the clock kept running. This is the one piece the
       simulation cannot do on its own (it only ever runs the credited window),
       so it is asserted where the caller does it: `tickBuffs` over the unpaid
       tail, which is the same primitive the span uses per tick.
       MUTATION: drop the unpaid-tail drain from the accrual caller and a
       12h30m buff comes back with 30 minutes still on it. */
    const B = window.HearthriseCore.buffs;
    assert(typeof B.tickBuffs === 'function', 'core/buffs.js must export tickBuffs — the tail drain uses it');
    const longBuff = night([{ type: 'drop_rate', magnitude: 100, remainingMs: CAP_MS + 1800000 }]);
    assert(longBuff.state.buffs.length === 1 && longBuff.state.buffs[0].remainingMs === 1800000,
      'the credited window must spend exactly its own 12h off the buff, leaving 30m for the tail — found '
      + JSON.stringify(longBuff.state.buffs));
    B.tickBuffs(longBuff.state.buffs, w.unpaidMs, { away: true, active: true });
    longBuff.state.buffs = B.pruneBuffs(longBuff.state.buffs);
    assert((longBuff.state.buffs || []).length === 0,
      'a 12h30m buff survived an 18h absence because the last 6h paid nothing — found '
      + JSON.stringify(longBuff.state.buffs) + '. The timers the player sees would disagree with the wall '
      + 'clock, which is the b326 mint in slow motion.');

    /* …and the drain is the WALL CLOCK, not "everything": a buff longer than
       the whole absence comes back with exactly the remainder. */
    const survives = night([{ type: 'drop_rate', magnitude: 100, remainingMs: AWAY_MS + 3600000 }]);
    B.tickBuffs(survives.state.buffs, w.unpaidMs, { away: true, active: true });
    survives.state.buffs = B.pruneBuffs(survives.state.buffs);
    assert(survives.state.buffs.length === 1, 'a buff longer than the absence must survive it');
    const leftMs = survives.state.buffs[0].remainingMs;
    assert(Math.abs(leftMs - 3600000) <= TICK,
      'an 18h absence must spend exactly 18h of a 19h buff, leaving 1h — found ' + leftMs + 'ms');
  }),

  () => tryRun('AWAY-24: the blessing channel is decided by AWAY_SCOPE ALONE — no simulation and no receipt restates it', () => {
    const C = window.HearthriseCore;
    const A = C.away;
    /* ══════════════════════════════════════════════════════════════════════
       DESIGN RULING 3.5 (binding, 2026-08-15).

       `blessed` was a handwritten `false` in FOUR places — combat-sim's span
       payload, skill-sim's `emptySummary`, artisan-sim's `emptySummary`, and
       processOffline's own `lastOfflineSummary` — each carrying its own
       comment restating "blessings are presence-gated (b227)". Those four
       agreed with `AWAY_SCOPE.blessing` by coincidence of authorship, not by
       construction. AWAY-6 pins that blessings pay NOTHING away; this pins
       something different and, for the next feature, more important: WHO
       DECIDES. The first world-boss blessing that is made to pay away flips
       one line of the table and, before this, would have left every
       welcome-back receipt in the game still stating that no blessing touched
       the night — and the receipt is the only thing a renderer is permitted
       to read, so the stale copy is the player-facing lie, not a tidiness
       problem.

       IT ASSERTS THE PROPERTY, NOT TODAY'S VALUE. It must stay green when
       `AWAY_SCOPE.blessing` becomes true; the value is AWAY-6's subject.

       MUTATION PROVEN RED, each independently, each after a green control:
         (i)   restore `blessed: false` in src/core/combat-sim.js   -> (b)
         (ii)  restore `blessed: false` in src/core/skill-sim.js    -> (b)
         (iii) restore `blessed: false` in src/core/artisan-sim.js  -> (b)
         (iv)  restore `blessed: false` in legacy's lastOfflineSummary -> (d)

       KNOWN LIMITATION, stated rather than hidden: (b) discriminates by
       running each span in BOTH contexts, so it can only see a constant that
       disagrees with the oracle in at least one of them. Today's regression
       shape (`false`) is caught in both regimes — under the current table it
       fails the live context, and under a flipped table it fails both. A
       hardcoded `true` would escape only in the flipped regime; (d)'s source
       guard is what covers that class for the client receipt.
       ══════════════════════════════════════════════════════════════════════ */

    /* (a) THE ORACLE, AND THAT IT CANNOT BE EDITED AT RUNTIME. A rule that a
       renderer or a restored save could flip is not an authority. */
    assert(A && typeof A.channelApplies === 'function' && A.CHANNEL && A.CHANNEL.BLESSING,
      'src/core/away.js must export channelApplies + CHANNEL — they are the single authority this test is about');
    assert(Object.isFrozen(A.AWAY_SCOPE),
      'AWAY_SCOPE must stay frozen: one writeable authority is still one authority, but only until something writes it');
    const oracle = (away) => A.channelApplies(A.CHANNEL.BLESSING, { away: away });

    /* (b) THE THREE SIMULATIONS REPORT THE ORACLE, in both contexts. Each is
       run over a ZERO-LENGTH span with an idle state, so this measures the
       payload and mutates nothing — no items, no XP, no buff clock. */
    const spans = [
      ['combatSim.simulateSpan', (ctx) => C.combatSim.simulateSpan({}, ctx)],
      ['skillSim.simulateSkillSpan', (ctx) => C.skillSim.simulateSkillSpan({}, ctx)],
      ['artisanSim.simulateArtisanSpan', (ctx) => C.artisanSim.simulateArtisanSpan({}, ctx)],
    ];
    const at = Date.now();
    spans.forEach(([name, run]) => {
      [true, false].forEach((away) => {
        const out = run({ away: away, fromMs: at, toMs: at, tickMs: 2400 });
        assert(out && typeof out.blessed === 'boolean',
          name + ' must STATE blessed on its payload (a renderer may not infer it), got ' + JSON.stringify(out && out.blessed));
        assert(out.blessed === oracle(away),
          name + ' answered blessed=' + out.blessed + ' for away=' + away + ', but AWAY_SCOPE says '
          + oracle(away) + '. The simulation is restating the rule instead of reading it.');
      });
    });

    /* (c) …AND THEY AGREE WITH EACH OTHER, which is the failure mode that
       actually shipped: three copies drifting is only visible when they are
       compared. Cheap, and it names the disagreement rather than leaving it
       to be inferred from two separate reds. */
    const awayVals = spans.map(([name, run]) => [name, run({ away: true, fromMs: at, toMs: at, tickMs: 2400 }).blessed]);
    assert(new Set(awayVals.map((p) => p[1])).size === 1,
      'the three away simulations disagree about blessings: ' + JSON.stringify(awayVals));

    /* (d) THE CLIENT RECEIPT DOES NOT CARRY A FIFTH COPY.
       b515 — THE FOURTH COPY MOVED HOUSE, and this is the half of the ruling
       that has to move with it. It used to live in `processOffline`'s own
       `lastOfflineSummary` literal, and this assertion read that function's
       source for a hardcoded `blessed:`. processOffline no longer writes a
       receipt at all: the local away engine is deleted and
       `accrue.js summaryFromAway` is now the ONE translator from the server's
       away payload to the welcome-back card.

       So the same discriminator is applied to the same class of defect at its
       new address, and behaviourally rather than by source text — which is
       strictly better, because a source check cannot tell a constant from a
       constant that happens to be right today. The receipt must REPORT what the
       payload said in both directions; a hardcoded literal can only match one.
       MUTATION: replace `blessed: !!a.blessed` in summaryFromAway with either
       literal → red on one of the two assertions below. */
    const AC = window.HearthriseAccrual;
    assert(AC && typeof AC.summaryFromAway === 'function',
      'accrue.js must export summaryFromAway — it is the only path from the server payload to the card');
    [true, false].forEach((v) => {
      const rec = AC.summaryFromAway({ grantMs: 3600000, kills: 1, blessed: v }, { version: 1 });
      assert(rec.blessed === v,
        'the welcome-back receipt reported blessed=' + rec.blessed + ' for a payload that said ' + v
        + ' — that is the fifth copy of a rule that has exactly one home (AWAY_SCOPE). A stale copy is '
        + 'the player-facing lie, because the receipt is the only thing a renderer may read.');
    });
    /* AND NOTHING RECONSTRUCTS IT FROM THE LIVE PAGE. An absent payload field
       must read false — "the server said nothing" — never "ask the table for
       what would be true right now", which is a different instant. */
    assert(AC.summaryFromAway({ grantMs: 3600000 }, { version: 1 }).blessed === false,
      'an away payload that states no blessing produced a receipt that claims one — the receipt is '
      + 'inferring, and b341\'s rule for exactly this row is STATED, NOT INFERRED');
  }),

  () => tryRun('AWAY-9: the summary carries the honesty payload the welcome-back renderer needs', () => {
    const G = window.G;
    const C = window.HearthriseCore;
    const P = window.HearthrisePresence;
    const snap = snapshotG();
    try {
      const m = window.MONSTERS.goblin;
      G.skills = Object.assign({}, G.skills, { attack: 50000, strength: 50000, hitpoints: 20000, defense: 20000 });
      G.activeMonster = 'goblin';
      G.monsterHp = m.hp; G.monsterMaxHp = m.hp;
      G.playerMaxHp = 200; G.playerHp = 200;
      G.buffs = [{ type: 'all_xp', magnitude: 10, remainingMs: 600000, addedAt: Date.now() }];
      let s = null;
      P._withOfflineReplay(() => { s = window.simulateAwayCombat(1, Date.now(), false); });
      assert(s, 'simulateAwayCombat must return a summary');
      assert(s.blessed === false, 'the summary must state blessings were NOT applied');
      /* `buffsPaused` used to be the interesting field and is now always false:
         nothing is paused away, so a card that printed "your buffs were
         paused" off a held buff would be quoting a rule that no longer exists.
         What replaced it is COVERAGE — how much of the absence a buff actually
         paid for, and which ones ran out. Stated, never inferred. */
      assert(s.buffsPaused === false, 'no buff is paused away any more — the summary must not claim one was');
      assert(typeof s.buffPaidMs === 'number' && s.buffPaidMs > 0,
        'a held buff must report the span it actually paid, got ' + s.buffPaidMs);
      assert(s.buffPaidMs <= 600000 + 5000,
        'a 10-minute buff cannot have paid ' + s.buffPaidMs + 'ms of the absence');
      assert(Array.isArray(s.buffsExpired), 'the summary must carry the list of buffs that ran out mid-absence');
      assert(typeof s.crits === 'number', 'the summary must report away crits so "142 kills · 21 crits" is sayable');
      assert(typeof s.featuredMs === 'number', 'the summary must report time on the featured boss');
      assert(s.capped === false, 'the summary must report whether the absence hit the cap');
      assert(s.rateMult === 1.00, 'the summary must state the away rate actually applied');
      assert(Array.isArray(s.segments) && s.segments.length >= 1, 'the summary must describe its UTC-day segments');
      /* With no buffs held, the coverage must be exactly zero — not "unknown"
         and not a default. A renderer that saw a positive number here would
         quote a buff the player never had. */
      G.buffs = [];
      G.activeMonster = 'goblin'; G.monsterHp = m.hp; G.playerHp = 200;
      let s2 = null;
      P._withOfflineReplay(() => { s2 = window.simulateAwayCombat(1, Date.now(), false); });
      assert(s2.buffsPaused === false, 'buffsPaused must be false when the player held no buffs');
      assert(s2.buffPaidMs === 0, 'a player who held no buffs must report 0ms of buffed absence, got ' + s2.buffPaidMs);
      assert(s2.buffsExpired.length === 0, 'and no buff can have expired, got ' + JSON.stringify(s2.buffsExpired));
    } finally { C.randomSeed(); restoreG(snap); }
  }),

  () => tryRun('AWAY-10 (balance risk, flagged by design): the 0.95 drop cap applies AFTER dropMult x featuredMult, and guaranteed drops stay unscaled', () => {
    const D = window.HearthriseCore.drops;
    /* A weekly BotD (x2.0) on a tier-6 boss with a high-value tradeable is a
       real market faucet. Two properties keep it bounded, and both are
       asserted here rather than assumed from a reading of the source. */
    const capped = D.effectiveDropChance({ id: 'x', ch: 0.9 }, { dropMult: 1.15, dropBuff: 0.5, featuredMult: 2.0 });
    assert(capped === 0.95, 'the cap must bind AFTER every multiplier (0.9 x 1.15 x 1.5 x 2.0 -> 0.95), got ' + capped);
    /* If the cap were applied BEFORE the multipliers, this would exceed 0.95. */
    assert(capped <= 0.95, 'no drop row may ever exceed the 0.95 chance cap');
    /* Ordering is genuinely multiplicative underneath the cap. */
    const uncapped = D.effectiveDropChance({ id: 'x', ch: 0.1 }, { dropMult: 1.15, dropBuff: 0.5, featuredMult: 2.0 });
    assert(Math.abs(uncapped - (0.1 * 1.15 * 1.5 * 2.0)) < 1e-9,
      'below the cap the chance must be the plain product, got ' + uncapped);
    /* A guarantee is a guarantee: a x2.0 weekly must never turn one certain
       drop into two, nor make it "more than certain". */
    const guaranteed = D.effectiveDropChance({ id: 'x', ch: 1 }, { dropMult: 1.15, dropBuff: 0.5, featuredMult: 2.0 });
    assert(guaranteed === 1, 'a guaranteed drop must be returned UNSCALED, got ' + guaranteed);
    const guaranteed3 = D.effectiveDropChance({ id: 'x', ch: 3 }, { dropMult: 2, featuredMult: 2 });
    assert(guaranteed3 === 3, 'a multi-guarantee row must also be unscaled, got ' + guaranteed3);
  }),

  () => tryRun('AWAY-11: toolCarry survives the trip that persists it AND reaches the cloud snapshot (it never did as _toolCarry)', () => {
    /* 2026-09-14 — THE CARRY'S HOME MOVED AGAIN, AND THIS TIME OFF THE CLIENT.
       `player_state.tool_carry` is a real column (2026-08-15-tool-carry.sql): the
       Edge engine advances it through the same core `advanceToolCarry` the
       attended tick uses, hr_apply validates it as a delta key, and hr_state_of
       projects it at `state.tool_carry`. So the field left RESIDUE_FIELDS — two
       copies of a fraction that pays out whole items is the residue-ahead class —
       and the journey that keeps it is now accrue.js reconcileToolCarry, wired
       into applyEnvelopeState AND record.js's idle-boot hydration. What this test
       still owns end to end: the carry survives the trip, the `_toolCarry` name
       never rides anything, and the v12→v13 migration is intact. */
    const G = window.G;
    const snap = snapshotG();
    try {
      G.toolCarry = { mining: 0.42 };
      /* The cloud snapshot is a DENYLIST that skips `_`-prefixed scratch —
         which is precisely why the old name lost the carry on a device switch. */
      const E = window.HearthriseEvents;
      assert(E && typeof E.snapshot === 'function', 'the cloud snapshot builder must be exposed');
      const cloud = E.snapshot(G);
      assert(cloud._toolCarry === undefined, 'the old underscored key must not be uploaded');
      /* THE TRIP THAT KEEPS IT: the server's own column, back through the
         reconcile. A reload starts from whatever `state.tool_carry` says. */
      const AC = window.HearthriseAccrual;
      assert(AC && typeof AC.reconcileToolCarry === 'function',
        'accrue.js must publish reconcileToolCarry — it is the only thing that restores the carry now');
      const reloaded = {};
      AC.reconcileToolCarry(reloaded, { ok: true, state: { tool_carry: { mining: 0.42 } } });
      assert(reloaded.toolCarry && reloaded.toolCarry.mining === 0.42,
        'the carry must be rebuilt from the projection, found ' + JSON.stringify(reloaded.toolCarry));
      /* AND IT MUST NOT BE PERSISTED CLIENT-SIDE. A second copy in the bag is the
         one a cloud restore rewinds, against a column the settle keeps advancing. */
      const CAP = window.HearthriseCapstone;
      assert(CAP && typeof CAP.buildResiduePatch === 'function', 'capstone.js does not publish buildResiduePatch');
      const patch = CAP.buildResiduePatch(G);
      assert(patch && patch.toolCarry === undefined,
        'toolCarry must NOT ride the residue PUT any more — `state.tool_carry` is the one copy');
      assert(patch._toolCarry === undefined, 'the old underscored key must not be persisted');
      /* And the migration that renames it is registered and idempotent. */
      const MIG = window.HEARTHRISE_MIGRATIONS || [];
      const step = MIG.find((s) => s.from === 12 && s.to === 13);
      assert(step, 'the v12 -> v13 toolCarry migration must be registered');
      const old = { v: 12, _toolCarry: { fishing: 0.7 } };
      step.apply(old);
      assert(old.toolCarry.fishing === 0.7 && old._toolCarry === undefined, 'the migration must move the carry and drop the old key');
      step.apply(old);
      assert(old.toolCarry.fishing === 0.7, 're-running the migration must be a no-op');
      const fresh = { v: 12 };
      step.apply(fresh);
      assert(fresh.toolCarry && Object.keys(fresh.toolCarry).length === 0, 'a save with no carry must get an empty object, not undefined');
    } finally { restoreGAndRecord(snap); try { window.saveLocal(); } catch {} }
  }),

  () => tryRun('AWAY-12: the second combat loop is GONE and cannot come back unnoticed', () => {
    assert(typeof window.processOfflineCombat === 'undefined',
      'processOfflineCombat exists again — the away ruling deleted it; add to simulateTick and gate on ctx.away instead');
    const C = window.HearthriseCore;
    assert(C.combatSim && typeof C.combatSim.simulateTick === 'function' && typeof C.combatSim.simulateSpan === 'function',
      'the unified simulation must be published on the core');
    /* combatTick must DELEGATE, not re-implement. A source-text check, because
       ES module namespaces are frozen so the function cannot be stubbed out.
       Read through `_tickSource()` rather than `window.combatTick`: the live
       tick is wrapped by combat-render.js, and inspecting the wrapper would
       tell us nothing about whether the engine has re-grown its own loop. */
    const src = window.HearthriseCombatSim._tickSource();
    assert(/simulateTick/.test(src), 'the live tick must call the shared simulateTick — it has re-grown its own loop');
    assert(!/rollAttack/.test(src), 'the live tick is rolling its own attacks again; that maths belongs in src/core');
    const away = String(window.simulateAwayCombat || '');
    assert(/simulateSpan/.test(away), 'away combat must be a SPAN of the shared tick');
    assert(/combatTickMs\(\)/.test(away),
      'away combat must use the same swing interval live play uses (gear speed + weapon family), not the flat tickMs constant');
  }),

  () => tryRun('AWAY-12b: weapon speed reaches away accrual NUMERICALLY — a hammer swings 1.35x slower over the same span', () => {
    /* AWAY-12 above greps `simulateAwayCombat` for the string `combatTickMs()`.
       That is a cheap canary and it is kept, but it only catches a literal
       revert: it still passes if someone wraps the call, clamps the result, or
       hands the interval the wrong equipment. THIS is the test that holds the
       ruling — it measures the tick budget a real span actually produces with
       real gear equipped, and reads the expected ratio off WEAPON_SPEED_MOD
       rather than a pinned number that would rot at the next re-tune. */
    const G = window.G;
    const C = window.HearthriseCore;
    const snap = snapshotG();
    try {
      const SPAN_MS = 3600000;
      /* Mid-day UTC so the span cannot straddle midnight — segment splitting is
         AWAY-4's subject, not this test's. */
      const FROM = Date.UTC(2026, 0, 15, 6, 0, 0);
      /* A rig that never lands a hit: `chance:()=>false` makes every rollAttack
         a miss, so nothing dies on either side and `ticks` is the pure tick
         BUDGET. No fx, so no side effects on the real game. */
      const ticksFor = (tickMs) => C.combatSim.simulateSpan({
        activeMonster: 'goblin', monsterHp: 1e6, monsterMaxHp: 1e6,
        playerHp: 1e6, playerMaxHp: 1e6, stats: {},
      }, {
        tickMs,
        rng: { next: () => 0.5, int: (a) => a, chance: () => false },
        monsters: window.MONSTERS,
        playerRolls: () => ({ accuracy: 0, maxHit: 1, critChance: 0 }),
        monsterRolls: () => ({ accuracy: 0, maxHit: 1 }),
        weakness: () => ({ dropMult: 1 }),
        bonus: () => 0,
        fromMs: FROM, toMs: FROM + SPAN_MS,
      }).ticks;

      const MOD = C.combat.WEAPON_SPEED_MOD;
      const measure = (itemId) => {
        assert(window.ITEMS[itemId], 'the rig needs ' + itemId + ' in the catalogue; without it this test is vacuous');
        G.equipment = { weapon: itemId };
        /* b456: the worn weapon has to arrive on the RECORD — combatTickMs reads
           the set through equipmentMap, so an unstamped write is UNKNOWN → naked →
           both weapons measure the same unarmed 2400ms and the ratio assertion
           compares a number with itself. */
        stampRecordLikeLoad(G);
        const ms = window.combatTickMs();
        return { ms, ticks: ticksFor(ms) };
      };

      const sword = measure('rune_sword');
      assert(sword.ticks > 100, 'the rig produced ' + sword.ticks + ' ticks — the ratio assertion would be meaningless');

      /* hammer 1.35 — the exact case the old away loop got wrong (it swung a
         hammer 26% MORE often asleep than awake). */
      const hammer = measure('rune_warhammer');
      const wantHammer = sword.ticks / MOD.hammer;
      assert(Math.abs(hammer.ticks - wantHammer) <= 1,
        'a hammer must swing ' + MOD.hammer + 'x slower AWAY too: expected ~' + wantHammer.toFixed(1)
        + ' ticks, got ' + hammer.ticks + ' (sword ' + sword.ticks + ' @' + sword.ms + 'ms, hammer @' + hammer.ms + 'ms)');

      /* bow 0.88 — the other direction, so a fix that merely slowed everything
         down uniformly cannot pass. */
      const bow = measure('yew_bow');
      const wantBow = sword.ticks / MOD.ranged;
      assert(Math.abs(bow.ticks - wantBow) <= 1,
        'a bow must swing ' + MOD.ranged + 'x faster AWAY too: expected ~' + wantBow.toFixed(1)
        + ' ticks, got ' + bow.ticks + ' (bow @' + bow.ms + 'ms)');
      assert(bow.ticks > sword.ticks && sword.ticks > hammer.ticks,
        'the three families must order bow > sword > hammer in swings per hour, got '
        + bow.ticks + ' / ' + sword.ticks + ' / ' + hammer.ticks);
    } finally { restoreG(snap); }
  }),

  () => tryRun('AWAY-12c: a hostile ctx.tickMs cannot inflate the away tick budget', () => {
    /* The latent exploit in the accrual primitive. `simulateSpan` divides
       elapsed time by ctx.tickMs, so tickMs is the single largest lever on the
       accrual path: at the old 1ms floor a 12-hour absence budgets ~43,200,000
       ticks instead of ~18,000 — a ~2400x mint.

       The CLIENT call was never exploitable (gear cannot change while you are
       away, and combatTickMs() already clamps). The SERVER is the exposure:
       the accrual Edge Function runs this exact function, and a tickMs read
       out of a request body would be sovereign. The rule is written into
       docs/design/server-authority.md §3 — the server DERIVES tickMs from
       server-owned equipment and never reads it from the client — and this
       guard is the second line of defence behind it. */
    const C = window.HearthriseCore;
    const CB = C.combat.COMBAT_BALANCE;
    assert(CB.minTickMs === 600,
      'the swing floor must be one shared constant at 600ms, found ' + CB.minTickMs);
    assert(typeof C.combatSim.resolveTickMs === 'function', 'the tick-interval resolver must be exported so it can be guarded');

    const SPAN_MS = 3600000;
    const FROM = Date.UTC(2026, 0, 15, 6, 0, 0);
    const MAX_TICKS = Math.floor(SPAN_MS / CB.minTickMs);
    const run = (ctxOver) => C.combatSim.simulateSpan({
      activeMonster: 'goblin', monsterHp: 1e6, monsterMaxHp: 1e6,
      playerHp: 1e6, playerMaxHp: 1e6, stats: {},
    }, Object.assign({
      rng: { next: () => 0.5, int: (a) => a, chance: () => false },
      monsters: window.MONSTERS,
      playerRolls: () => ({ accuracy: 0, maxHit: 1, critChance: 0 }),
      monsterRolls: () => ({ accuracy: 0, maxHit: 1 }),
      weakness: () => ({ dropMult: 1 }),
      bonus: () => 0,
      fromMs: FROM, toMs: FROM + SPAN_MS,
    }, ctxOver)).ticks;

    /* Every shape a forged or corrupt value actually arrives in: a JSON number,
       zero, negative, NaN, a STRING (a request body's native type), and the
       infinities. */
    const hostile = [1, 0.001, 0, -5, NaN, '1', '0', Infinity, -Infinity, null, undefined, {}, '2400abc'];
    for (const v of hostile) {
      const resolved = C.combatSim.resolveTickMs({ tickMs: v });
      assert(resolved >= CB.minTickMs,
        'resolveTickMs(' + String(v) + ') = ' + resolved + 'ms — below the ' + CB.minTickMs + 'ms floor');
      const ticks = run({ tickMs: v });
      assert(ticks <= MAX_TICKS,
        'ctx.tickMs=' + String(v) + ' budgeted ' + ticks + ' ticks in one hour; the floor caps it at ' + MAX_TICKS);
    }
    /* Garbage must fall back to the honest interval, not to the floor. */
    assert(C.combatSim.resolveTickMs({ tickMs: NaN }) === CB.tickMs, 'a garbage tickMs falls back to the base swing interval');
    assert(C.combatSim.resolveTickMs({}) === CB.tickMs, 'a missing tickMs falls back to the base swing interval');
    /* A slower-than-floor interval is honoured — the clamp is a floor, not a pin. */
    assert(C.combatSim.resolveTickMs({ tickMs: 3240 }) === 3240, 'a legitimate slower interval (hammer) must pass through untouched');
    /* Finer granularity is an EXPLICIT opt-in, never a permissive default. */
    assert(C.combatSim.resolveTickMs({ tickMs: 50, minTickMs: 10 }) === 50, 'an explicit minTickMs opt-in must be honoured');
    assert(C.combatSim.resolveTickMs({ tickMs: 50, minTickMs: 0 }) === CB.minTickMs, 'a zero opt-in must not disable the floor');
  }),

  () => tryRun('AWAY-15: the away buff clock is a TIMELINE — coverage is min(buff, span), it survives UTC midnight, and it is driven in PURE core', () => {
    /* AWAY-5 measures this through the browser: G.buffs, the wrapped getBonus
       chain, simulateAwayCombat. THIS one measures the same rule with none of
       that — a bare `simulateSpan` on a plain object, which is the exact shape
       the accrual Edge Function runs in Deno. If the clock ever gets wired to
       something browser-only, this is the test that notices.

       The rig never lands a hit (`chance: () => false`), so nothing dies and
       `ticks` is the pure tick BUDGET — the same rig AWAY-12b uses, for the
       same reason: a death mid-span would make every number below a
       measurement of the death instead of the buff. */
    const C = window.HearthriseCore;
    const B = C.buffs;

    /* (a) THE ALLOCATION-FREE PREDICATE MUST NOT DRIFT FROM THE ARRAY.
       `simulateSpan` asks `hasActiveBuff` ~18,000 times per absence and its
       whole reason to exist is skipping the allocation `activeBuffs` does. Two
       functions answering one question is how the away/live split rotted the
       first time, so the equivalence is asserted rather than assumed. */
    const shapes = [
      null, undefined, [], 'nonsense',
      [{ type: 'drop_rate', magnitude: 1, remainingMs: 0 }],
      [{ type: 'drop_rate', magnitude: 1, remainingMs: -5 }],
      [{ type: 'drop_rate', magnitude: 1, remainingMs: 1 }],
      [{ type: 'a_type_that_does_not_exist', magnitude: 1, remainingMs: 9e9 }],
      [{ type: 'a_type_that_does_not_exist', magnitude: 1, remainingMs: 9e9 }, { type: 'all_xp', magnitude: 2, remainingMs: 5 }],
      [null, { type: 'all_xp', magnitude: 2, remainingMs: 5 }],
    ];
    for (const q of shapes) {
      assert(B.hasActiveBuff(q) === (B.activeBuffs(q).length > 0),
        'hasActiveBuff disagreed with activeBuffs for ' + JSON.stringify(q));
    }

    const TICK = 2400;
    const run = (remainingMs, fromMs, spanMs) => {
      const state = {
        activeMonster: 'goblin', monsterHp: 1e9, monsterMaxHp: 1e9,
        playerHp: 1e9, playerMaxHp: 1e9, stats: {},
        buffs: remainingMs > 0 ? [{ type: 'drop_rate', magnitude: 100, remainingMs, addedAt: 0 }] : [],
      };
      const out = C.combatSim.simulateSpan(state, {
        away: true, fromMs, toMs: fromMs + spanMs, tickMs: TICK,
        rng: { next: () => 0.5, int: (a) => a, chance: () => false },
        monsters: window.MONSTERS,
        playerRolls: () => ({ accuracy: 0, maxHit: 1, critChance: 0 }),
        monsterRolls: () => ({ accuracy: 0, maxHit: 1 }),
        weakness: () => ({ dropMult: 1 }),
        bonus: () => 0,
      });
      return { out, state };
    };

    const MIDDAY = Date.UTC(2026, 0, 15, 6, 0, 0);
    const HOUR = 3600000;

    /* (b) COVERAGE IS min(buff, span) — the whole rule, in one line, at both
       ends and in the middle. TICK divides all three exactly, so these are
       equalities and not tolerances: an off-by-one drain would fail. */
    const short = run(300000, MIDDAY, HOUR);          // 5-min buff, 1h absence
    assert(short.out.ticks === HOUR / TICK, 'the rig must budget the full hour, got ' + short.out.ticks + ' ticks');
    assert(short.out.buffPaidMs === 300000,
      'a 5-minute buff must cover exactly 5 minutes of an hour, got ' + short.out.buffPaidMs + 'ms');
    assert(short.state.buffs.length === 0, 'and it must be gone from the queue afterwards');
    assert(short.out.buffsExpired.length === 1 && short.out.buffsExpired[0] === 'drop_rate',
      'the expiry must be reported by type, got ' + JSON.stringify(short.out.buffsExpired));

    const long = run(2 * HOUR, MIDDAY, HOUR);         // 2h buff, 1h absence
    assert(long.out.buffPaidMs === HOUR,
      'a buff longer than the absence must cover ALL of it, got ' + long.out.buffPaidMs + 'ms of ' + HOUR);
    assert(long.state.buffs.length === 1 && long.state.buffs[0].remainingMs === HOUR,
      'and must have exactly the absence spent off it, found ' + JSON.stringify(long.state.buffs));
    assert(long.out.buffsExpired.length === 0, 'a surviving buff must not be reported as expired');

    const none = run(0, MIDDAY, HOUR);
    assert(none.out.buffPaidMs === 0, 'no buff held must report exactly 0ms covered, got ' + none.out.buffPaidMs);

    /* (c) THE MINT, STATED AS AN INEQUALITY. This is the assertion that would
       fail if the clock were ever removed while the payout stayed: a buff can
       never cover more of an absence than it had life. */
    for (const [buffMs, spanMs] of [[60000, 12 * HOUR], [300000, 8 * HOUR], [20 * 60000, 12 * HOUR]]) {
      const r = run(buffMs, MIDDAY, spanMs);
      assert(r.out.buffPaidMs <= buffMs,
        'a ' + buffMs + 'ms buff covered ' + r.out.buffPaidMs + 'ms of a ' + spanMs + 'ms absence — that is a mint');
      assert(r.out.buffPaidMs === Math.min(buffMs, spanMs),
        'coverage must be exactly min(buff, span): expected ' + Math.min(buffMs, spanMs) + ', got ' + r.out.buffPaidMs);
    }

    /* (d) IT SURVIVES UTC MIDNIGHT. The absence is split into day segments for
       the Boss of the Day, and each segment rebuilds its ctx — so a clock kept
       per segment instead of per span would silently restore the buff at
       midnight and pay it twice. 23:30 -> 00:30 with a 45-minute buff must pay
       45 minutes across the boundary, not 30 + 45. */
    const NIGHT = Date.UTC(2026, 0, 15, 23, 30, 0);
    const cross = run(45 * 60000, NIGHT, HOUR);
    assert(cross.out.segments.length === 2, 'the rig must actually straddle midnight, got ' + cross.out.segments.length + ' segment(s)');
    assert(cross.out.buffPaidMs === 45 * 60000,
      'a 45-minute buff across UTC midnight must cover 45 minutes, got ' + (cross.out.buffPaidMs / 60000).toFixed(2) + ' minutes');
    assert(cross.state.buffs.length === 0, 'and must still be spent by the end of the night');

    /* (e) A SERVER STATE HAS NO BUFF QUEUE, and must not grow one. hr-accrue
       builds `state` from DB rows; every line of the clock has to be an inert
       no-op there or the Edge Function throws on a field it never had. */
    const server = {
      activeMonster: 'goblin', monsterHp: 1e9, monsterMaxHp: 1e9,
      playerHp: 1e9, playerMaxHp: 1e9, stats: {},
    };
    const sOut = C.combatSim.simulateSpan(server, {
      away: true, fromMs: MIDDAY, toMs: MIDDAY + HOUR, tickMs: TICK,
      rng: { next: () => 0.5, int: (a) => a, chance: () => false },
      monsters: window.MONSTERS,
      playerRolls: () => ({ accuracy: 0, maxHit: 1, critChance: 0 }),
      monsterRolls: () => ({ accuracy: 0, maxHit: 1 }),
      weakness: () => ({ dropMult: 1 }), bonus: () => 0, activeBuffCount: 0,
    });
    assert(server.buffs === undefined, 'the clock must not invent a buff queue on a state that has none');
    assert(sOut.buffPaidMs === 0 && sOut.buffsExpired.length === 0,
      'a buffless state must report zero coverage, got ' + sOut.buffPaidMs);
    assert(sOut.ticks === HOUR / TICK, 'and must still simulate its full span');

    /* (f) THE QUEUE IS READ FRESH, NOT CAPTURED — pinned by the one case that
       can actually tell the two apart.
       Note what does NOT distinguish them, because the obvious test is a
       vacuous one: `window.pruneBuffs()` reassigns `G.buffs` to a
       `filter()`ed array whose ELEMENTS are the same objects, so draining
       through a stale reference still mutates the very buffs the getBonus
       chain reads. (Measured: capturing the array once passes a
       reassignment test unchanged.)
       What does distinguish them is a buff APPEARING in a queue that was
       empty when the span began — a clock that captured `null` at the top
       would never drain it, so it would pay for the whole rest of the
       absence and come back reading full. That is the mint, and it is the
       assertion below. */
    const grew = {
      activeMonster: 'goblin', monsterHp: 1e9, monsterMaxHp: 1e9,
      playerHp: 1e9, playerMaxHp: 1e9, stats: {}, buffs: [],
    };
    let swings = 0;
    const HALF = (HOUR / TICK) / 2;
    const gOut = C.combatSim.simulateSpan(grew, {
      away: true, fromMs: MIDDAY, toMs: MIDDAY + HOUR, tickMs: TICK,
      rng: { next: () => 0.5, int: (a) => a, chance: () => false },
      monsters: window.MONSTERS,
      playerRolls: () => ({ accuracy: 0, maxHit: 1, critChance: 0 }),
      monsterRolls: () => ({ accuracy: 0, maxHit: 1 }),
      weakness: () => ({ dropMult: 1 }), bonus: () => 0,
      fx: {
        onSwing() {
          if (++swings === HALF) grew.buffs = [{ type: 'drop_rate', magnitude: 100, remainingMs: 10 * 60000, addedAt: 0 }];
        },
      },
    });
    assert(swings > HALF, 'the rig never reached its insertion point — the assertions below would be vacuous');
    assert(gOut.buffPaidMs === 10 * 60000,
      'a buff that appears mid-span must be clocked from that moment: expected 600000ms covered, got ' + gOut.buffPaidMs);
    assert(grew.buffs.length === 0,
      'and it must be spent and pruned by the end of the absence, found ' + JSON.stringify(grew.buffs));
  }),

  /* ═══════════════════════════════════════════════════════════════════════
     AWAY-16 — THE GATHER SPAN IS ONE LOOP TOO.

     `src/core/skill-sim.js simulateSkillSpan` is what legacy.js's away gather
     branch (`replayAwaySpan` + `doSkillAction(true)`) becomes, and what the
     accrual Edge Function already runs — 23 of the 344 catalogue activities
     that used to accrue NOTHING server-side.

     This is the AWAY-1 assertion for gathering, in the browser, on the real
     `G`: N live actions and one core span of exactly N actions' worth of time
     must produce the same bag, the same XP, the same counters and the same
     fractional tool carry. It is the client switch-over's precondition — if
     these two columns match, replacing the legacy branch with a call to core
     is a delegation and not a balance change.

     The fx map below IS the adapter the switch-over needs. It is written out
     here rather than described, so "what does the client have to pass?" has an
     executable answer. */
  () => tryRun('AWAY-16 PARITY: N live gather actions == one core span of N actions (bag, XP, counters, tool carry)', () => {
    const G = window.G;
    const C = window.HearthriseCore;
    const P = window.HearthrisePresence;
    const snap = snapshotG();
    try {
      assert(C && C.skillSim && typeof C.skillSim.simulateSkillSpan === 'function',
        'src/core/skill-sim.js is not published on HearthriseCore — the client can never call it');

      /* The best axe in the CATALOGUE, not an invented one: tool speed, tool
         double-yield and tool XP all have to be live or the fixture proves
         parity of the easy path only. */
      const axe = Object.keys(window.ITEMS)
        .filter((id) => window.ITEMS[id] && window.ITEMS[id].type === 'tool' && window.ITEMS[id].toolSkill === 'woodcutting')
        .sort((a, b) => (window.ITEMS[b].toolTier || 0) - (window.ITEMS[a].toolTier || 0))[0];
      assert(!!axe, 'no woodcutting tool in the catalogue — the fixture would be vacuous');

      const NODE = 'maple_tree';                 // qty [1,2] → a real RNG draw per action
      const N = 400;
      const setup = () => {
        G.activeSkill = 'woodcutting';
        G.skillTargetId = NODE;
        G.skills = Object.assign({}, G.skills, { woodcutting: 13034431 });   // 99: no level-up toasts
        G.inventory = { [axe]: 1 };
        G.equipment = Object.assign({}, G.equipment);
        G.toolCarry = {};
        G.stats = Object.assign({}, G.stats, { gathered: 0, chopped: 0, toolDoubles: 0 });
        G.buffs = [];
      };

      // ── Column A: the LIVE loop, N silent actions under a pinned seed ──
      /* THE INTERVAL IS READ INSIDE THE LATCH, and that is not a detail: a
         rotating gather-speed BLESSING is presence-gated, so `activityIntervalMs()`
         answers a smaller number outside `withOfflineReplay` than inside it.
         Sizing the span from the outside reading measured 375 core actions
         against 400 live ones the first time this test ran — a 6.25% divergence
         caused entirely by which side of the latch the question was asked from.
         legacy.js's `offlineIntervalMs()` is called from inside the latch for
         exactly this reason (b227), and the client switch-over must call
         `simulateSkillSpan` from inside it too. */
      setup();
      let stepMs = 0;
      C.reseed(0xC0FFEE);
      P._withOfflineReplay(() => {
        stepMs = window.activityIntervalMs();
        for (let i = 0; i < N; i++) window.doSkillAction(true);
      });
      assert(stepMs > 0, 'activityIntervalMs() returned ' + stepMs + ' — the rig cannot size a span');
      const live = {
        inventory: Object.assign({}, G.inventory),
        xp: G.skills.woodcutting,
        gathered: G.stats.gathered, chopped: G.stats.chopped, doubles: G.stats.toolDoubles,
        carry: Object.assign({}, G.toolCarry),
      };

      // ── Column B: ONE core span, sized to exactly N actions ───────────
      setup();
      C.reseed(0xC0FFEE);
      const nodes = C.skillSim.indexGatherNodes({
        woodcutting: window.TREES, mining: window.ROCKS, fishing: window.FISH_SPOTS,
      });
      let summary = null;
      P._withOfflineReplay(() => {
        summary = C.skillSim.simulateSkillSpan(G, {
          away: true,
          fromMs: 0, toMs: N * stepMs,
          rng: C.rng,
          items: window.ITEMS,
          nodes,
          bonus: window.getBonus,
          /* THE ADAPTER. Every side effect legacy.js performs inline, named. */
          fx: {
            addItem: (id, qty) => window.addItem(id, qty),
            addXp: (sk, amt) => window.addXp(sk, amt),
            updateDaily: (k, n) => window.updateDaily(k, n),
            updateQuest: (k, n) => window.updateQuest(k, n),
            onStop: () => window.stopSkill && window.stopSkill(),
          },
        });
      });
      const core = {
        inventory: Object.assign({}, G.inventory),
        xp: G.skills.woodcutting,
        gathered: G.stats.gathered, chopped: G.stats.chopped, doubles: G.stats.toolDoubles,
        carry: Object.assign({}, G.toolCarry),
      };

      assert(summary && summary.ticks === N,
        'the core span ran ' + (summary && summary.ticks) + ' actions, not the ' + N + ' it was sized for — '
        + 'the comparison below would be measuring two different amounts of work');
      assert(live.gathered > 0, 'the live column gathered nothing — the parity assertion would be vacuous');
      assert(live.doubles > 0, 'the fixture earned no tool doubles, so the deterministic carry is untested');
      assert(JSON.stringify(live.inventory) === JSON.stringify(core.inventory),
        'BAG DIVERGED between the live loop and the core span.\n  live: ' + JSON.stringify(live.inventory)
        + '\n  core: ' + JSON.stringify(core.inventory));
      assert(live.xp === core.xp, 'XP diverged: live ' + live.xp + ' vs core ' + core.xp);
      assert(live.gathered === core.gathered, 'stats.gathered diverged: ' + live.gathered + ' vs ' + core.gathered);
      assert(live.chopped === core.chopped, 'stats.chopped diverged: ' + live.chopped + ' vs ' + core.chopped);
      assert(live.doubles === core.doubles, 'tool doubles diverged: ' + live.doubles + ' vs ' + core.doubles);
      assert(JSON.stringify(live.carry) === JSON.stringify(core.carry),
        'the fractional tool carry diverged.\n  live: ' + JSON.stringify(live.carry)
        + '\n  core: ' + JSON.stringify(core.carry));
      /* The map legacy.js increments live must be the one core owns, or an
         away night and a live hour move different rows. */
      assert(C.skillSim.SKILL_ACTION_STAT.woodcutting === 'chopped'
        && C.skillSim.SKILL_ACTION_STAT.mining === 'mined'
        && C.skillSim.SKILL_ACTION_STAT.fishing === 'fished',
        'core SKILL_ACTION_STAT drifted from the counters the daily goals read');
      /* b351 — ONE IDENTITY, not two maps that happen to agree today.
         `window.SKILL_ACTION_STAT` is what quest-nav.js inverts; core's is what
         `resolveGatherTick` WRITES. A value comparison would pass on two copies
         and go on passing until somebody edited one of them, so compare the
         REFERENCE. (This is also the guard on a real load-order trap: legacy.js
         is a classic script and core-bridge.js is a module, so a re-export
         written in legacy.js would silently take its fallback branch forever.) */
      assert(window.SKILL_ACTION_STAT === C.skillSim.SKILL_ACTION_STAT,
        'window.SKILL_ACTION_STAT is a SECOND COPY of core\'s map, not the same object — '
        + 'an away night and a live hour can now be made to move different counters');
    } finally {
      C.randomSeed();
      restoreG(snap);
    }
  }),

  /* ═══════════════════════════════════════════════════════════════════════
     AWAY-19 — THE ARTISAN SPAN IS ONE LOOP TOO. (b351)

     AWAY-16's assertion, for the 290 catalogue rows it did not cover — 84% of
     all activities, and the last simulation in the game that had no DOM-free
     form. `src/core/artisan-sim.js simulateArtisanSpan` is what legacy.js's
     away branch (`replayAwaySpan` over thousands of `window.doArtisanAction`
     calls) became.

     N live production ticks and ONE core span of exactly N ticks' worth of
     time must produce the same bag, the same XP, the same counters, the same
     burns and the same fractional tool carry.

     THE FIXTURE IS COOKING ON PURPOSE. It is the only bench that rolls a burn,
     so it exercises the second of the three RNG draws whose ORDER is part of
     the replay contract (craftSave, burn, yield). A fixture on smithing would
     pass while a reordered stream went unnoticed. */
  () => tryRunRestampingBalance('AWAY-19 PARITY: N live artisan actions == one core span of N actions (bag, XP, burns, counters, tool carry)', () => {
    if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(true);
    const G = window.G;
    const C = window.HearthriseCore;
    const P = window.HearthrisePresence;
    const snap = snapshotG();
    const realNotify = window.notify;
    try {
      assert(C && C.artisanSim && typeof C.artisanSim.simulateArtisanSpan === 'function',
        'src/core/artisan-sim.js is not published on HearthriseCore — the client can never call it');

      /* ⚠ THE FIRST FIXTURE WAS `cook_shrimp` AT LEVEL 99 AND IT PROVED NOTHING.
         Burn relief is 1pp per level above the recipe's req, so 99 against a
         req-1 recipe is 98pp of relief: the chance is clamped to ZERO and the
         column never burnt once in 300 ticks. Every parity assertion passed —
         on a fixture that had silently stopped exercising draw 2 of 3. The
         `live.burns > 0` precondition below is what caught it, which is exactly
         why a parity test needs preconditions and not just comparisons.

         `cook_moonfish` is req 88; the level is pinned to exactly 88, so the
         burn sits at the full 25% base and 300 ticks of its 420 XP do not reach
         89 (measured: 4,385,776 + 126,000 is still level 88). */
      const RECIPE = 'cook_moonfish';
      const N = 300;
      const entry = C.artisanRecipe(RECIPE);
      assert(entry && entry.skill === 'cooking', 'the recipe index does not resolve ' + RECIPE + ' to cooking');
      const REQ_XP = C.xp.XP_TABLE[entry.recipe.req - 1];

      const setup = () => {
        G.activeMonster = null;
        G.activeSkill = 'cooking';
        G.skillTargetId = RECIPE;
        G.skills = Object.assign({}, G.skills, { cooking: REQ_XP });
        G.inventory = { moonfish: N + 50 };         // never runs dry inside the span
        G.equipment = Object.assign({}, G.equipment);
        G._recipeUnlocks = { map: {}, at: Date.now() };   // the learned set is the SERVER projection now
        G.toolCarry = {};
        G.stats = Object.assign({}, G.stats, { cooked: 0, burnt: 0, toolDoubles: 0 });
        G.buffs = [];
        window._hrOfflineBurns = 0;
      };
      window.notify = function () {};             // a burn toast per tick otherwise

      // ── Column A: the LIVE production tick, N times, under a pinned seed ──
      /* Read INSIDE the latch, for the reason AWAY-16 records: a cook-speed
         BLESSING is presence-gated, so `activityIntervalMs()` answers a smaller
         number outside `withOfflineReplay` than inside it, and the span would be
         sized off a rate the replay never runs at. */
      setup();
      let stepMs = 0;
      C.reseed(0x5EAF00D);
      P._withOfflineReplay(() => {
        stepMs = window.activityIntervalMs();
        for (let i = 0; i < N; i++) window.doArtisanAction('cooking', RECIPE, { silent: true });
      });
      assert(stepMs > 0, 'activityIntervalMs() returned ' + stepMs + ' — the rig cannot size a span');
      const live = {
        inventory: Object.assign({}, G.inventory),
        xp: G.skills.cooking,
        cooked: G.stats.cooked, burnt: G.stats.burnt, doubles: G.stats.toolDoubles,
        burns: window._hrOfflineBurns,
        carry: Object.assign({}, G.toolCarry),
      };

      // ── Column B: ONE core span, sized to exactly N actions ───────────
      setup();
      C.reseed(0x5EAF00D);
      let summary = null;
      P._withOfflineReplay(() => {
        summary = C.artisanSim.simulateArtisanSpan(G, {
          away: true,
          fromMs: 0, toMs: N * stepMs,
          rng: C.rng,
          items: window.ITEMS,
          recipes: C.artisanRecipes(),
          bonus: window.getBonus,
          /* THE ADAPTER — the same one processOffline passes. Written out here
             so "what does the client have to supply?" has an executable answer. */
          fx: {
            addItem: (id, q) => window.addItem(id, q),
            removeItem: (id, q) => window.removeItem(id, q),
            addXp: (sk, amt) => window.addXp(sk, amt),
            updateDaily: (k, n) => window.updateDaily(k, n),
            updateQuest: (k, n) => window.updateQuest(k, n),
          },
        });
      });
      const core = {
        inventory: Object.assign({}, G.inventory),
        xp: G.skills.cooking,
        cooked: G.stats.cooked, burnt: G.stats.burnt, doubles: G.stats.toolDoubles,
        burns: summary.burnt,
        carry: Object.assign({}, G.toolCarry),
      };

      assert(summary && summary.ticks === N,
        'the core span ran ' + (summary && summary.ticks) + ' actions, not the ' + N + ' it was sized for — '
        + 'the comparison below would be measuring two different amounts of work');
      assert(summary.stoppedBy === null,
        'the span stopped early (' + summary.stoppedBy + ') — the fixture was meant to run clean');
      /* Preconditions, so a green result can never be vacuous. */
      assert(live.cooked > 0, 'the live column cooked nothing — the parity assertion would be vacuous');
      assert(live.burns > 0, 'the fixture never burnt, so the burn roll (draw 2 of 3) is untested');

      assert(JSON.stringify(live.inventory) === JSON.stringify(core.inventory),
        'BAG DIVERGED between the live loop and the core span.\n  live: ' + JSON.stringify(live.inventory)
        + '\n  core: ' + JSON.stringify(core.inventory));
      assert(live.xp === core.xp, 'cooking XP diverged: live ' + live.xp + ' vs core ' + core.xp);
      assert(live.cooked === core.cooked, 'stats.cooked diverged: ' + live.cooked + ' vs ' + core.cooked);
      assert(live.burnt === core.burnt, 'stats.burnt diverged: ' + live.burnt + ' vs ' + core.burnt);
      assert(live.burns === core.burns,
        'the REPORTED burn count diverged: the live replay counted ' + live.burns
        + ' into window._hrOfflineBurns, the span reported ' + core.burns
        + ' — the welcome-back card reads this number');
      assert(live.doubles === core.doubles, 'tool doubles diverged: ' + live.doubles + ' vs ' + core.doubles);
      assert(JSON.stringify(live.carry) === JSON.stringify(core.carry),
        'the fractional artisan tool carry diverged.\n  live: ' + JSON.stringify(live.carry)
        + '\n  core: ' + JSON.stringify(core.carry));
    } finally {
      if (window.HearthriseCore && window.HearthriseCore.artisanSim) window.HearthriseCore.artisanSim.__setCookingSettlementArm(null);
      window.notify = realNotify;
      window._hrOfflineBurns = 0;
      C.randomSeed();
      restoreG(snap);
    }
  }),

  /* ═══════════════════════════════════════════════════════════════════════
     AWAY-20 — THE RECIPE INDEX IS THE ONE MAPPING, AND IT IS SAFE. (b351)

     The server holds ONE id (`player_state.active_id`) and no skill column, so
     an index is the only thing that can say which bench an id belongs to.
     legacy.js answered that question four separate times with
     `ARTISAN_RECIPES[skill].find(...)`, which is how a recipe comes to pay one
     bench's XP on the client and another's on the server.

     Two hazards, both asserted rather than trusted:
       • a DUPLICATE id across benches makes the answer depend on iteration
         order — 290 recipes today, 0 collisions, and a fifth bench is a data row;
       • `active_id` is bounded by /^[a-z0-9_]{1,64}$/ at the request layer,
         which MATCHES `constructor` and `__proto__`. On a plain object both are
         truthy, and a truthy miss here reaches `recipe.inputs` / `recipe.output`
         — Security's pre-registered C6, in the one index where it would pay. */
  () => tryRun('AWAY-20: the artisan recipe index has no duplicate ids and no prototype to fall through to', () => {
    const C = window.HearthriseCore;
    assert(C && C.artisanSim, 'src/core/artisan-sim.js is not published');
    const src = window.ARTISAN_RECIPES;
    assert(src && Object.keys(src).length >= 4, 'ARTISAN_RECIPES is not loaded — the guard would be vacuous');

    const dupes = C.artisanSim.duplicateRecipeIds(src);
    assert(dupes.length === 0,
      'a recipe id is claimed by more than one bench, so which skill it pays depends on key order: '
      + JSON.stringify(dupes));

    const idx = C.artisanRecipes();
    const n = Object.keys(idx).length;
    let authored = 0;
    Object.keys(src).forEach((sk) => { authored += (src[sk] || []).length; });
    assert(n === authored,
      'the index holds ' + n + ' recipes but ' + authored + ' are authored — rows were dropped or collided');
    assert(n > 250, 'only ' + n + ' recipes indexed — the catalogue did not load');

    assert(Object.getPrototypeOf(idx) === null,
      'the recipe index has a prototype — `constructor` and `__proto__` are reachable ids that would '
      + 'resolve to something truthy and then be read as a recipe');
    ['constructor', '__proto__', 'toString', 'hasOwnProperty'].forEach((probe) => {
      assert(!C.artisanRecipe(probe),
        'artisanRecipe("' + probe + '") returned something — a forged active_id reaches recipe.inputs');
    });

    /* The lookup and the index must be the same object, or the memo is a second
       copy that can go stale against a catalogue swap. */
    assert(C.artisanRecipes() === idx, 'artisanRecipes() is not memoised — it rebuilds 290 rows per call');
  }),

  /* ═══════════════════════════════════════════════════════════════════════
     AWAY-21 — CORE AND THE ENGINE MUST AGREE ABOUT THE ARTISAN INTERVAL. (b351)

     `n = floor(sliceMs / stepMs)` makes the interval the divisor of the whole
     grant — the single largest lever in an accrual. legacy's
     `activityIntervalMs()` is what the LIVE loop and the away replay actually
     run at, and it adds `bestToolSpeed(skill)` for EVERY skill (Wave 3: "a Forge
     Hammer speeds smithing exactly as a Rune Axe speeds woodcutting").
     `core/pacing.js actionSpeedBonus` gated that term to GATHER_SKILLS, so a
     server pricing a smithing night off `actionIntervalMs` ran the bench up to
     the tool ladder's 25% SLOWER than the client — and `actionRate`, the ONE
     rate calculator every artisan tile reads, under-quoted it on screen.

     Asserted against a bench WITH a tool, or the fixture proves nothing: with
     no hammer owned both expressions agree trivially. */
  () => tryRun('AWAY-21: the artisan interval core derives == the one the live loop runs, tool speed included', () => {
    const G = window.G;
    const C = window.HearthriseCore;
    const snap = snapshotG();
    try {
      const hammer = Object.keys(window.ITEMS)
        .filter((id) => window.ITEMS[id] && window.ITEMS[id].type === 'tool' && window.ITEMS[id].toolSkill === 'smithing')
        .sort((a, b) => (window.ITEMS[b].toolTier || 0) - (window.ITEMS[a].toolTier || 0))[0];
      assert(!!hammer, 'no smithing tool in the catalogue — the fixture would be vacuous');

      const entry = C.artisanRecipe('smelt_copper');
      assert(entry && entry.skill === 'smithing', 'smelt_copper does not resolve to smithing');

      G.activeMonster = null;
      G.activeSkill = 'smithing';
      G.skillTargetId = 'smelt_copper';
      G.inventory = { [hammer]: 1, copper_ore: 100 };
      G.equipment = Object.assign({}, G.equipment);

      const toolSpeed = window.HearthriseTools.bestToolSpeed('smithing');
      assert(toolSpeed > 0, 'the best smithing tool contributes no speed — the assertion below is vacuous');

      const live = window.activityIntervalMs();
      const core = C.artisanSim.artisanIntervalMs(G, 'smithing', entry.recipe, {
        items: window.ITEMS, bonus: window.getBonus,
      });
      assert(live === core,
        'THE LARGEST LEVER IN AN ACCRUAL DISAGREES. legacy activityIntervalMs() says ' + live
        + 'ms, core artisanIntervalMs() says ' + core + 'ms. The tool contributes '
        + (toolSpeed * 100).toFixed(0) + '%, so a server would pay a different night than the client.');

      /* And the number on screen must be the number the game runs at — the
         second half of the same defect. */
      const rate = window.actionRate('smithing', entry.recipe);
      assert(rate && rate.ms === live,
        'actionRate quotes ' + (rate && rate.ms) + 'ms while the bench runs at ' + live
        + 'ms — the artisan tile is under-reporting the rate the player is already paid at');
    } finally {
      restoreG(snap);
    }
  }),

  () => tryRun('AWAY-13 (perf): the analytics bridge must not write localStorage once per engine event', () => {
    /* Found with the CPU profiler while measuring a 12-hour away catch-up:
       observability.js subscribes to the event bus with on('*') and its track()
       did a FULL read-modify-write of a 500-entry JSON buffer per event —
       parse, push, stringify, setItem. That was 46% of the whole replay, and
       it costs live play on every kill too. Same shape as the incident
       sync.js documents above its EVENT_ALLOWLIST.

       The guard counts real setItem calls, because "it looks debounced" is not
       a measurement. */
    assert(typeof window.trackEvent === 'function', 'the analytics funnel must be wired');
    assert(typeof window.__hrPersistAnalytics === 'function', 'the durable-write seam must be exposed');
    const KEY = 'hearthrise:analytics:buffer';
    const realSet = localStorage.setItem.bind(localStorage);
    let writes = 0;
    try {
      localStorage.setItem = function (k, v) { if (k === KEY) writes++; return realSet(k, v); };
      for (let i = 0; i < 200; i++) window.trackEvent('smoke_probe', { i });
      assert(writes === 0,
        '200 analytics events caused ' + writes + ' localStorage writes — the hot path must be debounced, not synchronous');
      window.__hrPersistAnalytics();
      assert(writes === 1, 'an explicit persist must write exactly once, got ' + writes);
      const durable = JSON.parse(realSet ? (localStorage.getItem(KEY) || '[]') : '[]');
      assert(durable.some((e) => e && e.name === 'smoke_probe'),
        'the debounced buffer must still reach localStorage — a crash needs its breadcrumbs');
    } finally {
      localStorage.setItem = realSet;
      try { localStorage.removeItem(KEY); } catch {}
    }
  }),

  () => tryRun('AWAY-14 (perf): the per-kill companion/pet lookups are indexed, and the index invalidates on a catalogue swap', () => {
    /* Both tables were rebuilt on every kill (and pets.js rebuilt its on every
       addXp — three to five times per combat TICK). Memoised now. The risk a
       memo introduces is staleness, so that is what this asserts: swap the
       catalogue and the answer must change. */
    const P = window.HearthrisePets;
    const realC = window.COMPANIONS;
    try {
      if (P && typeof P.rollBossPet === 'function') {
        /* A pet whose source names a monster that cannot exist: with a live
           cache the roll finds it; after a swap to an empty table it must not. */
        window.COMPANIONS = { __probe: { n: 'Probe', source: 'boss:__no_such_monster__:2', icon: '🐾' } };
        assert(P.rollBossPet('__no_such_monster__', () => 1) === false, 'a guaranteed-miss roll must not unlock');
        window.COMPANIONS = {};
        assert(P.rollBossPet('__no_such_monster__', () => 0) === false,
          'after the catalogue is emptied the memoised pet table must be rebuilt, not served stale');
      }
      /* The companion drop index is internal; assert the observable contract —
         a kill against a monster with no companion source does no work and
         throws nothing, and the wrapper chain is still intact. */
      assert(typeof window.killMonster === 'function', 'the kill wrapper chain must survive the indexing change');
    } finally { window.COMPANIONS = realC; }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     b326 — THE PLAYER-FACING HONESTY SURFACES
     (docs/design/away-time-ruling.md §"Player-facing honesty", items 1–5)

     The ruling's own framing: "the silent penalty was the actual sin". These
     guard the CURE, so the failure mode they exist to catch is a renderer that
     stops saying something — or, worse, starts saying something it was never
     given. Every one asserts BOTH directions: the clause appears when the
     payload carries it, and is ABSENT when it does not.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRun('b326-1: the welcome-back band states the rate, the crits, the featured boss and the paused buffs — and invents none of them', () => {
    const G = window.G;
    const H = window.HearthriseHome;
    assert(H && typeof H.render === 'function', 'the Home dashboard must expose render()');
    const prevSummary = G.lastOfflineSummary;
    const prevTab = window.activeTab;
    try {
      window.showTab('profile');
      const FULL = {
        hrs: 8.2, awayMs: 8.2 * 3600000, gainedItems: 38, gainedXp: 12408, gainedGold: 5121,
        gainedKills: 142, burnt: 0, budgetHrs: 12, capped: false, at: Date.now(),
        blessed: false, buffsPaused: true, crits: 21,
        featuredMs: 8 * 3600000, featuredDropMult: 1.5, rateMult: 1.0, combat: null,
      };
      G.lastOfflineSummary = FULL;
      H.render();
      const root = document.getElementById('hd-root');
      assert(root, 'the Home dashboard root must exist');
      const band = root.querySelector('.hd-awayband');
      assert(band, 'a welcome-back band must render while the summary is still news');
      const txt = band.textContent.replace(/\s+/g, ' ');

      /* Item 1 — the duration is the REAL span, not the 0.1h-rounded number,
         and the rate statement is unconditional. */
      assert(/8h 12m away/.test(txt), 'the band must print the real span ("8h 12m"), got: ' + txt);
      assert(/base rate/i.test(txt) && /blessings and food buffs pay while you play/i.test(txt),
        'the band must state that the absence paid the base rate: ' + txt);
      /* Item 2 — away combat reports its crits. */
      assert(/142 kills/.test(txt) && /21 crits/.test(txt),
        'away combat must report kills AND crits ("142 kills · 21 crits"): ' + txt);
      /* Item 1b — the featured boss, its real duration, and the multiplier the
         SIMULATION reported (never a guessed default). */
      assert(/8h on the Boss of the Day/.test(txt), 'the band must report featured time: ' + txt);
      assert(/\+50% drops/.test(txt), 'the band must quote the multiplier the payload carried: ' + txt);
      /* Item 3 — a held buff is reported as paused, not as paid. */
      assert(/paused/i.test(txt), 'the band must say the held buffs were paused: ' + txt);
      assert(!/blessing.*applied|blessed/i.test(txt.replace(/blessings and food buffs pay while you play/i, '')),
        'the band must never claim a blessing was applied: ' + txt);

      /* The other direction. A quiet night: no combat, no buffs held, no
         featured boss. Every conditional clause must DISAPPEAR — a renderer
         that prints "your buffs were paused" beside an empty buff list is the
         same species of lie, pointed the other way. */
      G.lastOfflineSummary = Object.assign({}, FULL, {
        gainedKills: 0, crits: 0, featuredMs: 0, featuredDropMult: 1, buffsPaused: false,
      });
      H.render();
      const quiet = document.getElementById('hd-root').querySelector('.hd-awayband');
      const qtxt = quiet ? quiet.textContent.replace(/\s+/g, ' ') : '';
      assert(quiet, 'the band must still render for a non-combat absence');
      assert(!/crits/.test(qtxt), 'no crit line when nothing was fought: ' + qtxt);
      assert(!/Boss of the Day/.test(qtxt), 'no featured-boss line when featuredMs is 0: ' + qtxt);
      assert(!/paused/i.test(qtxt), 'no paused-buff line when buffsPaused is false: ' + qtxt);
      assert(/base rate/i.test(qtxt), 'the rate statement is unconditional and must survive: ' + qtxt);

      /* A WEEKLY boss pays x2.0. A renderer that hardcoded the daily x1.5
         would halve the night in copy — so the number comes from the payload. */
      G.lastOfflineSummary = Object.assign({}, FULL, { featuredDropMult: 2.0 });
      H.render();
      assert(/\+100% drops/.test(document.getElementById('hd-root').textContent),
        'a weekly featured boss must read +100% drops, not the daily default');

      /* An OLD summary (written before the field existed) must say the boss
         applied and quote NO percentage, rather than invent the daily one. */
      const legacySummary = Object.assign({}, FULL);
      delete legacySummary.featuredDropMult;
      G.lastOfflineSummary = legacySummary;
      H.render();
      const ltxt = document.getElementById('hd-root').textContent.replace(/\s+/g, ' ');
      assert(/Boss of the Day/.test(ltxt), 'a pre-b326 summary must still report the featured time');
      assert(!/Boss of the Day \(\+/.test(ltxt),
        'with no featuredDropMult in the payload the band must quote NO percentage: ' + ltxt);

      /* Stale news steps aside — the band is a greeting, not furniture. */
      G.lastOfflineSummary = Object.assign({}, FULL, { at: Date.now() - 60 * 60000 });
      H.render();
      assert(!document.getElementById('hd-root').querySelector('.hd-awayband'),
        'the band must disappear once the summary is no longer news');
    } finally {
      G.lastOfflineSummary = prevSummary;
      try { H.render(); } catch (e) {}
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════
     OFFLINE-CLARITY — the three away/offline comms fixes.
     ══════════════════════════════════════════════════════════════════════ */

  () => tryRun('OFFLINE-CLARITY 3: the away card attributes gains to the activity that earned them', () => {
    const H = window.HearthriseHome;
    assert(H && typeof H.__awayCardHtml === 'function', 'the away card seam must exist');
    const base = {
      hrs: 8, awayMs: 8 * 3600000, gainedXp: 0, gainedItems: 0, gainedGold: 0, gainedKills: 0,
      crits: 0, burnt: 0, capped: false, blessed: false, buffsPaused: false, rateMult: 1,
      featuredMs: 0, featuredDropMult: 1, died: false, combat: null, at: Date.now(),
    };
    // A combat night — kills come only from fighting, so it must say so.
    const fight = H.__awayCardHtml(Object.assign({}, base, { gainedXp: 900, gainedKills: 42, crits: 6 }));
    assert(/Earned while fighting/.test(fight), 'a combat night must attribute to fighting: ' + fight);
    // A gather/craft night — gains but no kills.
    const gather = H.__awayCardHtml(Object.assign({}, base, { gainedXp: 900, gainedItems: 120 }));
    assert(/Earned while gathering or crafting/.test(gather),
      'a non-combat paid night must attribute to gathering or crafting: ' + gather);
    // The other direction: a quiet/idle night attributes NOTHING — there is
    // nothing to attribute, and inventing an activity would be the same lie.
    const quiet = H.__awayCardHtml(Object.assign({}, base, { idle: true }));
    assert(!/Earned while/.test(quiet), 'a quiet night must not attribute any activity: ' + quiet);
  }),

  /* COOKING REAL-FIX — cooking BANKS now: the settlement arm is on (both twins),
     so the accrual engine settles cooking away time and the row must say so (the
     b388 honesty rule, in the paying direction). */
  () => tryRun('OFFLINE-CLARITY 2: the Right-now banking row states the cap and whether the activity banks', () => {
    const H = window.HearthriseHome;
    assert(H && typeof H.__awayBankingRow === 'function', 'the banking-row seam must exist');
    const cap = (typeof window.offlineCapHours === 'function') ? window.offlineCapHours() | 0 : 12;
    // Combat always banks.
    const inCombat = H.__awayBankingRow({ activeMonster: 'slime', activeSkill: null });
    assert(/Banking offline/.test(inCombat) && new RegExp('up to ' + cap + 'h').test(inCombat),
      'combat must read as banking, with the real cap: ' + inCombat);
    // A gather skill banks (serverAccruedSkill true).
    const woodcut = H.__awayBankingRow({ activeMonster: null, activeSkill: 'woodcutting' });
    assert(/Banking offline/.test(woodcut), 'gathering must read as banking: ' + woodcut);
    // Cooking BANKS now — the settlement arm is on (both twins), so the accrual
    // engine settles cooking away time and the row must say so (b388 honesty).
    const cooking = H.__awayBankingRow({ activeMonster: null, activeSkill: 'cooking' });
    assert(/Banking offline/.test(cooking),
      'cooking must be shown as banking under the armed settlement: ' + cooking);
    // Idle: nothing banks, but the cap + what DOES bank is still surfaced proactively.
    const idle = H.__awayBankingRow({ activeMonster: null, activeSkill: null });
    assert(/Nothing is banking/.test(idle) && new RegExp('up to ' + cap + 'h').test(idle),
      'an idle camp must proactively state the cap and what banks: ' + idle);
  }),

  () => tryRun('OFFLINE-CLARITY 1: a genuine idle absence is never silent — a display-only welcome-back is written', () => {
    assert(typeof window.maybeIdleAwayReceipt === 'function', 'maybeIdleAwayReceipt must be published');
    const A = window.HearthriseAccrual;
    const G = window.G;
    const prev = G.lastOfflineSummary;
    const prevGold = G.gold, prevSkills = G.skills;
    try {
      const now = Date.now();
      // A sub-sync span (tab-flip) writes NOTHING — narrating it would be the
      // b361 "Away 0h" bug pointed the other way.
      G.lastOfflineSummary = null;
      const flip = window.maybeIdleAwayReceipt(now, now - 90 * 1000);
      assert(flip === null && !G.lastOfflineSummary, 'a 90s span must not write a welcome-back');
      // A real idle absence (8h) writes a display-only receipt: every total 0.
      G.lastOfflineSummary = null;
      const rec = window.maybeIdleAwayReceipt(now, now - 8 * 3600000);
      assert(rec && G.lastOfflineSummary === rec, 'a real idle absence must write a summary');
      assert(rec.idle === true, 'the idle receipt must be flagged idle');
      assert(rec.gainedXp === 0 && rec.gainedItems === 0 && rec.gainedGold === 0 && rec.gainedKills === 0,
        'the idle receipt must credit nothing — it is display-only');
      // It classifies as an ABSENCE so the Home away card greets the player...
      assert(A.classifyReceipt(rec) === 'away', 'the idle receipt must classify as away so the card shows');
      // ...and the card renders its quiet branch, telling them what banks.
      const html = window.HearthriseHome.__awayCardHtml(rec);
      assert(/While you were away/.test(html), 'the idle receipt must render the welcome-back card');
      /* 2026-09-07: RE-PINNED with cooking in the list. b388 wrote this line
         WITHOUT cooking because cooking did not pay away; b431 armed it and the
         sentence was never updated, so the card spent a hundred builds telling
         players the stove earns nothing overnight. FL-AWAY-COOK-1 (regression
         suite) binds the clause to the arm itself so the pair can never drift
         again in either direction. */
      assert(/Fighting, gathering, cooking and crafting all bank/.test(html),
        'the idle card must explain what banks offline: ' + html);
      assert(!/Earned while/.test(html), 'an idle night attributes no activity');
    } finally {
      G.lastOfflineSummary = prev; G.gold = prevGold; G.skills = prevSkills;
    }
  }),

  () => tryRun('OFFLINE-CLARITY 1b: the idle welcome-back fires ONCE per frozen-watermark return (no ×N re-fire)', () => {
    // Regression for the live "×13" idle-card spam: an IDLE character under
    // server-accrual authority has a FROZEN away watermark (nothing local
    // advances it — the server only stamps accrued_to on a real activity delta),
    // yet processOffline runs on every visibility return / reload and re-narrated
    // the same (ever-growing) "nothing was set to bank" card each time. The fix
    // latches on the absence anchor: greet once, stay silent until the watermark
    // actually moves. Display-only throughout — this asserts NO minting.
    assert(typeof window.maybeIdleAwayReceipt === 'function', 'maybeIdleAwayReceipt must be published');
    const G = window.G;
    const prev = G.lastOfflineSummary;
    const prevAnchor = G._idleReceiptAnchor;
    const prevGold = G.gold, prevSkills = G.skills;
    try {
      const now = Date.now();
      const frozen = now - 8 * 3600000;   // the FROZEN watermark anchor (8h stale)
      G.lastOfflineSummary = null; delete G._idleReceiptAnchor;

      // First return greets the player and latches the anchor.
      const first = window.maybeIdleAwayReceipt(now, frozen);
      assert(first && first.idle === true, 'first return must write the idle welcome-back');
      assert(typeof G._idleReceiptAnchor === 'number', 'the anchor must be latched after the first greeting');

      // A re-entrant processOffline moments later (same frozen anchor, now larger
      // because the watermark did NOT advance) must NOT re-fire.
      G.lastOfflineSummary = null;
      const second = window.maybeIdleAwayReceipt(now + 5000, frozen);
      assert(second === null && !G.lastOfflineSummary, 'the same frozen-anchor return must NOT re-narrate the card');
      // And a whole re-load later (bigger elapsed, same anchor) still silent.
      const third = window.maybeIdleAwayReceipt(now + 90 * 60000, frozen);
      assert(third === null, 'a later return on the SAME watermark must stay silent — no ×N spam');

      // But once the watermark ACTUALLY moves (a real accrual advanced it), a
      // genuinely new absence greets again — the latch suppresses spam, never a
      // legitimate later welcome-back.
      G.lastOfflineSummary = null;
      const moved = window.maybeIdleAwayReceipt(now + 90 * 60000, now + 60 * 60000);
      assert(moved && moved.idle === true, 'a moved watermark (real new absence) must greet again');

      // Nothing minted anywhere: every idle receipt credits zero.
      assert(moved.gainedGold === 0 && moved.gainedXp === 0 && moved.gainedItems === 0,
        'the idle receipt must credit nothing — display only');
    } finally {
      G.lastOfflineSummary = prev; G.gold = prevGold; G.skills = prevSkills;
      if (prevAnchor === undefined) delete G._idleReceiptAnchor; else G._idleReceiptAnchor = prevAnchor;
    }
  }),

  () => tryRun('b326-2: the simulation reports the drop multiplier featured time actually paid', () => {
    const C = window.HearthriseCore;
    const S = C.combatSim;
    assert(typeof S.simulateSpan === 'function', 'simulateSpan must exist');
    /* Read from the SIMULATION, because a renderer that has to guess which
       boss it was will eventually quote the wrong lift. Asserted structurally:
       a span with no featured segment reports the neutral 1. */
    const state = { activeMonster: null, stats: {}, skills: {}, gold: 0 };
    const out = S.simulateSpan(state, {
      fromMs: 0, toMs: 3600000, away: true, tickMs: 2400,
      rng: C.rngMod.createRng(1), bonus: () => 0,
    });
    assert(typeof out.featuredDropMult === 'number',
      'the honesty payload must carry featuredDropMult so the welcome-back line can quote a real number');
    assert(out.featuredDropMult === 1, 'a span with no featured time must report the neutral multiplier, not a default lift');
  }),

  () => tryRun('buffs step 2: the server owns the clock — the pill is the envelope, it never pauses, '
    + 'and it shows the segment running NOW', () => {
    /* WHAT THIS REPLACED, AND WHY THAT IS NOT A DELETED TEST. This slot held
       b326-3, "a paused buff renders as PAUSED with its time preserved" — the OLD
       ruling, where `tickBuffs` froze whenever nothing was running. Two rulings of
       2026-09-13 retired it (wall-clock drain; per-segment magnitudes), and a test
       asserting a retired rule is not evidence — so it is REWRITTEN in place and
       every assertion it protected survives below. THE ATTENDED HALF; the away half
       is tests/buff-queue.mjs [20]. */
    const G = window.G;
    const H = window.HearthriseHome;
    const A = window.HearthriseAccrual;
    const snap = snapshotG();
    const prevTab = window.activeTab;
    try {
      assert(typeof window.buffsFrozen !== 'function',
        'window.buffsFrozen is still published. The freeze it answered for is DELETED (wall-clock ruling): a '
        + 'surface that can still ask "is this clock paused?" will eventually draw the answer, and the server '
        + 'has no such state.');
      assert(typeof A.reconcileBuffs === 'function',
        'accrue.js must export reconcileBuffs — without it a reload forgets a running buff while the server '
        + 'goes on paying it');
      window.showTab('profile');
      G.activeSkill = null; G.skillTargetId = null; G.activeMonster = null; G.activeArtisanRecipe = null;

      /* (1) THE ENVELOPE IS THE PILL. Two contiguous segments of one type plus an
         EXPIRED entry, which hr_state_of carries at remaining_ms 0 for the away
         engine and which nothing may render. */
      const seg = (type, magnitude, ms) =>
        ({ type, magnitude, until: new Date(Date.now() + ms).toISOString(), remaining_ms: ms });
      G.buffs = [{ type: 'damage', magnitude: 99, remainingMs: 9e9, addedAt: Date.now() }];
      A.reconcileBuffs(G, { ok: true, buffs: [seg('gather_speed', 15, 6 * 60000),
        seg('gather_speed', 2, 20 * 60000), seg('all_xp', 4, 0)] });
      assert(G.buffs.length === 2 && !G.buffs.some((b) => b.type === 'damage'),
        'the envelope must REPLACE the local queue (a forged +99% must not survive it — that is the '
        + 'residue-ahead class this field used to be) and must drop the expired entry: '
        + JSON.stringify(G.buffs));

      /* (2) ONE ROW PER EFFECT, SHOWING THE SEGMENT RUNNING NOW: +15% for six
         minutes then +2%, never "+15% for 26 minutes" (the merge bug's signature). */
      H.render();
      const hd = document.getElementById('hd-root');
      const rows = hd.querySelectorAll('.hd-buff');
      const rowTxt = rows.length ? rows[0].textContent.replace(/\s+/g, ' ') : '';
      assert(rows.length === 1,
        'Home must render ONE row per effect even when a type holds several segments; got ' + rows.length);
      assert(/Gather Speed/.test(rowTxt) && /\+15%/.test(rowTxt) && /6:00/.test(rowTxt)
        && !/paused/i.test(rowTxt),
        'the row must name the buff, the magnitude RUNNING NOW (+15%, not the queued +2%) and the time until '
        + 'the bonus CHANGES (6:00, not the 26:00 the queue empties at), and never say paused: ' + rowTxt);
      assert(/real time/i.test(hd.textContent) && /away/i.test(hd.textContent),
        'the ladder must state the rule a player can lose a Feast by not knowing: the clock is real time and '
        + 'runs while they are away');

      /* (3) IT DRAINS WITH NOTHING RUNNING — the old freeze made this call a no-op,
         which is what showed an 8m40s pill for an hour. */
      const before = G.buffs[0].remainingMs;
      window.advanceBuffClock(60000);
      assert(G.buffs[0].remainingMs === before - 60000,
        'an idle minute must drain the buff by a minute — BUFF_DRAIN_RULE is wall-clock and the server keeps '
        + 'expiring the absolute `until` whether or not the player is doing anything. Got '
        + G.buffs[0].remainingMs + ' from ' + before);

      /* (4) THE ACTIVE EFFECTS PANEL, same rules, and the boundary is NAMED. */
      window.__renderBuffsSection();
      const brs = [...document.querySelectorAll('.buff-row')].map((r) => r.textContent.replace(/\s+/g, ' '));
      assert(brs.length === 1, 'the Active Effects panel must show one row per effect: ' + brs.length);
      assert(/\+15%/.test(brs[0]) && /then \+2%/.test(brs[0]) && !/paused/i.test(brs[0]),
        'the row must state the running magnitude, NAME what it becomes at the boundary, and carry no '
        + 'paused chip: ' + brs[0]);
      /* THE GESTURE RULE IS STATED, not inferable: the server buffs a MANUAL eat only
         (the auto-eater heals), so the panel and every buff food's tooltip carry one
         published sentence. Asserted on the PANEL and on the TOOLTIP's own source. */
      const panel = document.getElementById('food-buffs-host').textContent;
      assert(/eat it yourself/i.test(panel) && /auto-eating only heals/i.test(panel),
        'the Active Effects panel must state that a buff needs a manual Eat: ' + panel);
      assert(typeof window.BUFF_GESTURE_NOTE === 'string'
        && window.foodUseInfo('fishers_pie').buffText !== '',
        'the tooltip reads window.BUFF_GESTURE_NOTE for any food with a buffText; one of the two is gone, '
        + 'so a buff food can be bought with no statement of who has to eat it');

      /* (5) THE GESTURE REACHES THE SERVER. `buff_apply` is the Edge's to build (the
         real delta is applied in tests/buff-queue.mjs [18]); the CLIENT's half is the
         `auto` bit — without it every auto-eat heal buffs, caps the queue, and is
         refused buff_at_max, which rolls back the debit and restocks the food. */
      const wire = (auto) => JSON.parse(window.HearthriseEat.buildEatRequest({
        url: 'https://example.test', apiKey: 'k', token: 't', slot: 0,
        intentId: '00000000-0000-4000-8000-000000000001', item: 'fishers_pie', auto,
      }).init.body);
      const manual = wire(false);
      assert(manual.item === 'fishers_pie' && manual.auto === false && wire(true).auto === true,
        'a MANUAL eat must go on the wire as auto:false (so the server grants the buff) and an AUTO eat must '
        + 'declare itself: ' + JSON.stringify(manual));
      assert(Object.keys(manual).sort().join(',') === 'auto,intentId,item,slot,verb',
        'the eat request must carry a NAME and the gesture and nothing else — no heal, no hp, no qty, no '
        + 'magnitude, no duration: ' + Object.keys(manual).sort().join(','));

      /* (6) 0-EMOJI RULE, preserved from the test this replaced. */
      const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
      [rows[0].textContent, ...brs].forEach((t) => {
        assert(!EMOJI.test(t), 'no emoji may render on a buff surface: ' + t);
      });

      /* (7) ABSENCE IS NOT AN EVICTION: no `buffs` key is a partial answer, not "you
         hold nothing" (§6, never evict on uncertainty). */
      const keep = G.buffs.length;
      A.reconcileBuffs(G, { ok: true, state: {} });
      assert(G.buffs.length === keep,
        'an envelope without a `buffs` key must leave the queue alone; got ' + JSON.stringify(G.buffs));
    } finally {
      restoreG(snap);
      try { H.render(); } catch (e) {}
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  () => tryRun('buffs step 3: the Cellar line on a buff pill is the ENVELOPE\'s `scale` — never a '
    + 'client-priced room', () => {
    /* WHAT THIS PROTECTS. 2026-09-13-buff-cellar-scale.sql makes hr_apply stamp each
       buff segment with the duration multiplier the player's OWN Cellar rungs bought
       (1.0 unperked, up to 2.0 at The Deep Cellar), and hr_state_of projects it as
       `scale`. The minutes are already inside `until`, so the client's only job is to
       SAY SO. Two ways to get that wrong, both red below:
         · price the line from G.rooms — a client authoring a buff clock (the
           wall-clock ruling) and residue-ahead by construction, because a rung bought
           between two helpings would relabel a segment stamped at the old scale;
         · treat a MISSING field as 1.0-with-a-line, which would have every pre-migration
           segment brag about a Cellar that did not pay it.
       THE MUTATION LEVER IS ARMED FOR THE WHOLE TEST: The Deep Cellar is owned, so
       getBonus('buffDuration') is 1.0 and any room-derived implementation answers
       "+100% from the Cellar" — which every arm here asserts against. */
    const G = window.G;
    const H = window.HearthriseHome;
    const A = window.HearthriseAccrual;
    const snap = snapshotG();
    const prevTab = window.activeTab;
    const prevRooms = G.rooms;
    try {
      assert(typeof window.buffScaleNote === 'function',
        'src/render/active-effects.js must publish ONE buffScaleNote — Home and Active Effects wording the '
        + 'same rule differently is how a rule becomes folklore');
      window.showTab('profile');
      G.activeSkill = null; G.skillTargetId = null; G.activeMonster = null; G.activeArtisanRecipe = null;
      /* `rooms` is server-of-record, so a raw `G.rooms = …` is UNKNOWN to every
         reader and fails closed to the empty map. stampRecordLikeLoad pushes
         the rung through the REAL hr_load path, which is what a player's Cellar is. */
      G.rooms = { cellar: 5 };
      stampRecordLikeLoad(G);
      const roomPct = Math.round((window.getBonus('buffDuration') || 0) * 100);
      assert(roomPct > 0 && roomPct !== 40,
        'the lever is not armed: with The Deep Cellar owned, the client-side buffDuration bonus must be a '
        + 'NON-ZERO number that is NOT the 40 the envelope states, or the "never computed from rooms" '
        + 'assertions below cannot bite. Got ' + roomPct + ' DIAG rooms=' + JSON.stringify(window.roomsMapG()) + ' raw=' + window.HearthriseCore.perks.permanentBonus('buffDuration', window.clientPerkState()) + '.');

      const seg = (ms, scale) => {
        const o = { type: 'gather_speed', magnitude: 15, remaining_ms: ms,
          until: new Date(Date.now() + ms).toISOString() };
        if (scale !== undefined) o.scale = scale;
        return o;
      };
      const paint = (scale) => {
        A.reconcileBuffs(G, { ok: true, buffs: [seg(6 * 60000, scale)] });
        window.__renderBuffsSection();
        H.render();
        return (document.getElementById('food-buffs-host').textContent + ' | '
          + document.getElementById('hd-root').textContent).replace(/\s+/g, ' ');
      };

      /* (1) A PERKED SEGMENT SAYS SO, on BOTH buff surfaces, at the SERVER's number. */
      const perked = paint(1.4);
      assert(G.buffs.length === 1 && G.buffs[0].scale === 1.4,
        'reconcileBuffs must carry `scale` through display-only; got ' + JSON.stringify(G.buffs));
      assert((perked.match(/\+40% from the Cellar/g) || []).length === 2,
        'the Active Effects row AND the Home pill must each state "+40% from the Cellar" for a segment the '
        + 'server stamped at scale 1.4: ' + perked);
      assert(!(perked.indexOf('+' + roomPct + '% from the Cellar') >= 0),
        'the line was priced from G.rooms (The Deep Cellar reads +' + roomPct + '%), not from the envelope. `scale` '
        + 'describes the rung that stamped THIS segment; a room-derived number overstates a buff already '
        + 'running and is the residue-ahead class: ' + perked);
      assert(/6m 0s/.test(perked) && /6:00/.test(perked),
        'the Cellar already paid its minutes into `until`; the clock shown must still be the envelope\'s '
        + 'remaining_ms, never remaining_ms x scale: ' + perked);

      /* (2) AN UNPERKED SEGMENT SAYS NOTHING. scale 1.0 is "no Cellar paid this", and a
         "+0% from the Cellar" chip is noise a player would read as a fact. */
      assert(!/from the Cellar/.test(paint(1)),
        'scale 1.0 must draw no Cellar line on either surface');

      /* (3) ABSENCE IS NOT A STATEMENT (CLAUDE.md §6): a segment written before the
         migration has no `scale`, and an unknown is never rendered as a claim. */
      assert(!/from the Cellar/.test(paint(undefined)),
        'a segment with NO `scale` key must draw no Cellar line — inferring one from the rooms the player '
        + 'happens to own now is exactly the forbidden client-side computation');
    } finally {
      restoreG(snap);
      G.rooms = prevRooms;
      try { H.render(); } catch (e) {}
      try { window.showTab(prevTab || 'profile'); } catch (e) {}
    }
  }),

  () => tryRun('b326-4: both Boss-of-the-Day cards state that they pay while you are away', () => {
    const B = window.HearthriseBossOfDay;
    assert(B, 'the Boss of the Day feature must be loaded');
    const prevTab = window.activeTab;
    try {
      window.showTab('combat');
      if (typeof B.render === 'function') B.render();
      if (typeof B.renderWeekly === 'function') B.renderWeekly();
      ['hr-botd-card', 'hr-weekly-card'].forEach((id) => {
        const card = document.getElementById(id);
        if (!card || card.style.display === 'none') return;   // no boss in the pool today
        const away = card.querySelector('.botd-away');
        assert(away, id + ' must carry the away line — "set it before bed" must be readable, not folklore');
        assert(/away/i.test(away.textContent), id + ' away line must actually say it pays while away');
      });
    } finally { try { window.showTab(prevTab || 'profile'); } catch (e) {} }
  }),

  () => tryRun('b326-5: an away-earnings preview is computed with away:true — it can never quote a BLESSING, and it quotes personal buffs exactly as the live rate does', () => {
    const G = window.G;
    const P = window.HearthrisePresence;
    const snap = snapshotG();
    try {
      const tree = (window.TREES || []).find((t) => t.id === 'oak_tree') || (window.TREES || [])[0];
      assert(tree, 'a gathering action is needed to compare rates');
      /* ── WHAT CHANGED HERE, AND WHY THE INVARIANT DID NOT ─────────────────
         b326 froze buffs away, so this test asserted the two rates must PART
         COMPANY when a buff is held: away < live. Buffs are personal and pay
         away now (src/core/away.js), so the honest away rate with a buff held
         is the SAME as the live one, and asserting divergence would be
         asserting a rule that was deleted.

         The invariant this test actually protects is untouched and is asserted
         below: the away preview may never quote MORE than the live rate. That
         is what keeps the pill safe to show unconditionally, and it is the
         BLESSING channel — still closed away — that it guards.

         The buff is `all_xp` DELIBERATELY, not `gather_speed`: speed bonuses
         pass through SPEED_FUSE (0.70), so on a save whose perks and tools
         already saturate the fuse a speed buff changes nothing and the test
         would be flaky rather than wrong. `allXP` is an uncapped additive term
         in actionRate, so the agreement below is arithmetic, not accidental. */
      G.buffs = [
        { type: 'all_xp', magnitude: 60, remainingMs: 600000, addedAt: Date.now() },
        { type: 'gather_speed', magnitude: 25, remainingMs: 600000, addedAt: Date.now() },
      ];
      const live = window.actionRate('woodcutting', tree);
      const away = window.actionRate('woodcutting', tree, { away: true });
      assert(live && away, 'actionRate must answer in both contexts');
      assert(away.ms >= live.ms,
        'the away rate must never be FASTER than the live one — no away channel may outpay a live one');
      assert(away.xpPerHour <= live.xpPerHour, 'the away rate must never exceed the live rate');
      assert(away.xpPerAction === live.xpPerAction,
        'with a +60% all-XP buff held, a PERSONAL buff must reach the away preview identically ('
          + away.xpPerAction + ' vs ' + live.xpPerAction + ')');
      /* And the channel that is still closed must still be closed — otherwise
         "the two rates agree" would be evidence the gate had been removed
         wholesale rather than opened for one channel. */
      const A = window.HearthriseCore.away;
      assert(A.channelApplies('blessing', { away: true }) === false && A.channelApplies('buff', { away: true }) === true,
        'the preview must be quoting an away rate whose BLESSING channel is shut and whose BUFF channel is open');
      /* KNOWN LIMITATION, stated so nobody reads the equality above as a
         promise: `actionRate` quotes an INSTANTANEOUS rate, and a buff with ten
         minutes left will only pay the first ten minutes of a twelve-hour
         absence (AWAY-15 measures exactly that). The live pill has always had
         this property; the away pill now shares it rather than differing. */

      /* It must be the SAME calculator through the SAME latch — not a second
         "offline rate" function that will drift. Proven by equality with a
         rate computed inside the replay latch directly. */
      let inLatch = null;
      P._withOfflineReplay(() => { inLatch = window.actionRate('woodcutting', tree); });
      assert(inLatch.xpPerHour === away.xpPerHour && inLatch.ms === away.ms,
        'actionRate(..., {away:true}) must equal the rate computed inside the offline-replay latch');

      /* The latch is depth-counted and released in a finally: a preview must
         never leave the game stuck in unblessed mode. */
      assert(P.inOfflineReplay() === false, 'an away preview must not leave the replay latch closed');

      /* With nothing held the preview must still never quote MORE than live —
         the invariant that makes the pill safe to show unconditionally. (It is
         not asserted EQUAL: a live blessing legitimately lifts the live rate,
         which is precisely the case the pill exists to disclose.) */
      G.buffs = [];
      const l2 = window.actionRate('woodcutting', tree);
      const a2 = window.actionRate('woodcutting', tree, { away: true });
      assert(a2.xpPerHour <= l2.xpPerHour && a2.xpPerAction <= l2.xpPerAction,
        'the away preview must never exceed the live rate, buff or no buff');
    } finally { restoreG(snap); }
  }),

  () => tryRun('b326-6 (perf): the dashboard and the quest strip do no work inside the away-replay latch', () => {
    const P = window.HearthrisePresence;
    const prevTab = window.activeTab;
    try {
      window.showTab('profile');
      /* The replay grants XP and kills thousands of times before the first
         paint. Every grant used to repaint this dashboard and the quest strip.
         The contract: inside the latch these are no-ops; processOffline()
         repaints once when it opens. */
      const sub = document.getElementById('dash-user-sub');
      if (sub) {
        const before = sub.textContent;
        sub.textContent = '__replay_probe__';
        P._withOfflineReplay(() => { window.renderProfile(); });
        assert(sub.textContent === '__replay_probe__',
          'renderProfile must not repaint inside the away-replay latch');
        window.renderProfile();
        assert(sub.textContent !== '__replay_probe__',
          'renderProfile must repaint normally once the latch opens — the skip must be lossless');
        if (sub.textContent !== before) { /* recomputed from live state; fine */ }
      }
      assert(typeof window.renderQuestStrip === 'function',
        'the quest strip must be published so processOffline can repaint it exactly once');
      const strip = document.getElementById('global-quests-strip');
      if (strip) {
        const list = strip.querySelector('.gq-list');
        if (list) {
          list.innerHTML = '<i id="__strip_probe__"></i>';
          P._withOfflineReplay(() => { window.renderQuestStrip(); });
          assert(document.getElementById('__strip_probe__'),
            'the quest strip must not repaint inside the away-replay latch');
          window.renderQuestStrip();
          assert(!document.getElementById('__strip_probe__'),
            'the quest strip must repaint once the latch opens');
        }
      }
    } finally { try { window.showTab(prevTab || 'profile'); } catch (e) {} }
  }),

  /* ───────────────────────────────────────────────────────────────────────
     b329 regression suite — A11: the invite check must not read the table

     The finding: `beta_invites` carried `for select to PUBLIC using (true)`,
     and settings-page.js checked a code with
     `GET /rest/v1/beta_invites?code=eq.X&select=code,used_by` using the ANON
     key, before sign-up. An anon key therefore returned every code in the
     closed beta with one request. RLS cannot express "you may read the row you
     named" — a policy sees rows, never the request's filter — so the read has
     to become a function, and that function has to be the client's ONLY route.
     Until this test passed, the server-side policy drop could not be applied
     without breaking sign-up.

     tryRun is SYNCHRONOUS — an async test body would return a promise that is
     never awaited and would pass while asserting nothing (the always-null-probe
     family, nine instances on this project). validateInvite() has no await
     before its fetch(), so the request is issued synchronously on call and can
     be asserted synchronously. Do not "fix" this test by making it async.
     ─────────────────────────────────────────────────────────────────────── */
  () => tryRun('b329/A11: the invite check calls the beta_invite_check RPC and never reads the beta_invites table', () => {
    const inv = window.HearthriseInvite;
    assert(inv && typeof inv.validate === 'function',
      'HearthriseInvite.validate must be published so the request shape is testable');

    const calls = [];
    const realFetch = window.fetch;
    const sb = window.HearthriseSupabase;
    const realGetConfig = sb && sb.getConfig;
    try {
      if (sb) sb.getConfig = () => ({ url: 'https://probe.invalid', anonKey: 'anon-probe-key' });
      window.fetch = function (url, opts) {
        calls.push({ url: String(url), opts: opts || {} });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      };

      const p = inv.validate('FRIEND-001');
      if (p && typeof p.catch === 'function') p.catch(() => {});

      assert(calls.length === 1, `the invite check must issue exactly one request, saw ${calls.length}`);
      const c = calls[0];

      /* The control: this substring is what the exploit looked like. */
      assert(c.url.indexOf('/beta_invites') === -1,
        'the client must NEVER request the beta_invites table directly — that read returns every code: ' + c.url);
      assert(c.url.indexOf('/rest/v1/rpc/beta_invite_check') !== -1,
        'the invite check must go through the beta_invite_check RPC: ' + c.url);
      assert(String(c.opts.method || 'GET').toUpperCase() === 'POST',
        'a PostgREST RPC call must be POST — a GET would put the code in the query string');
      /* The code is a secret in transit: it belongs in the body, never in a URL
         that lands in proxy and server access logs. */
      assert(c.url.indexOf('FRIEND-001') === -1,
        'the invite code must not appear in the URL: ' + c.url);
      const body = JSON.parse(c.opts.body || '{}');
      assert(body.p_code === 'FRIEND-001',
        'the RPC takes the code as p_code in the JSON body, saw: ' + (c.opts.body || '(none)'));
    } finally {
      window.fetch = realFetch;
      if (sb && realGetConfig) sb.getConfig = realGetConfig;
    }
  }),

  /* ═══════════════════════════════════════════════════════════════════════
     b330 — CLAN MEMBERSHIP: the transport, and the surface that makes it real
     ═══════════════════════════════════════════════════════════════════════
     `2026-08-11-clan-membership-authority.sql` (APPLIED) exists because any
     account could POST itself into any clan via /rest/v1/clan_members, and
     leadership had NO way to remove it (S-CAP-1 / S-KICK). Two halves have to
     hold for that to be closed in practice:

       1. the client must JOIN THROUGH THE RPC and never through the table —
          the table write skips the ban list, the invite bookkeeping, the
          journal and the rate limit;
       2. the remedy must be CLICKABLE. A kick RPC nobody can reach is the same
          as no remedy, which is the state this build shipped in.

     tryRun is SYNCHRONOUS. joinById() issues its fetch before its first await
     (requireOnline() is sync, and rpc() calls fetch as its first statement), so
     the request shape is assertable synchronously — verified by the call-count
     assertion below, which would read 0 if the fetch had moved behind an await.
     Do not make these async. ─────────────────────────────────────────────── */
  () => tryRun('b330: joinById goes through the clan_join RPC and NEVER writes /rest/v1/clan_members', () => {
    const Cl = window.HearthriseClans;
    assert(Cl && typeof Cl.joinById === 'function', 'HearthriseClans.joinById must be published');

    const calls = [];
    const realFetch = window.fetch;
    const sb = window.HearthriseSupabase, au = window.HearthriseAuth;
    const realGetConfig = sb && sb.getConfig, realGetSession = au && au.getSession;
    const realNotify = window.notify;
    try {
      if (sb) sb.getConfig = () => ({ url: 'https://probe.invalid', anonKey: 'anon-probe-key' });
      if (au) au.getSession = () => ({ access_token: 'probe-token', user: { id: 'probe-user' } });
      window.notify = () => {};
      window.fetch = function (url, opts) {
        calls.push({ url: String(url), opts: opts || {} });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, clan_id: 'c1' }) });
      };

      const p = Cl.joinById('11111111-2222-3333-4444-555555555555');
      if (p && typeof p.catch === 'function') p.catch(() => {});

      assert(calls.length === 1, 'joining must issue exactly one request, saw ' + calls.length +
        ' — a 0 here means the fetch moved behind an await and this test is asserting nothing');
      const c = calls[0];

      /* THE CONTROL: this is what the hole looked like. `/rest/v1/clan_members`
         with no `/rpc/` in front of it IS the uninvited-join path. */
      assert(!/\/rest\/v1\/clan_members/.test(c.url),
        'the client must NEVER write clan_members directly — that is the uninvited-join path S-CAP-1 names: ' + c.url);
      assert(c.url.indexOf('/rest/v1/rpc/clan_join') !== -1,
        'joining must go through the clan_join RPC: ' + c.url);
      assert(String(c.opts.method || 'GET').toUpperCase() === 'POST',
        'a PostgREST RPC call must be POST');
      const body = JSON.parse(c.opts.body || '{}');
      assert(body.p_clan_id === '11111111-2222-3333-4444-555555555555',
        'the RPC takes the clan as p_clan_id in the JSON body, saw: ' + (c.opts.body || '(none)'));
      /* The server derives the joiner from auth.uid(); a client-supplied user id
         would be a forged identity crossing to another player's clan. */
      assert(body.p_user_id === undefined && body.user_id === undefined,
        'the client must not name WHO is joining — the server takes that from auth.uid(): ' + c.opts.body);
    } finally {
      window.fetch = realFetch;
      window.notify = realNotify;
      if (sb && realGetConfig) sb.getConfig = realGetConfig;
      if (au && realGetSession) au.getSession = realGetSession;
    }
  }),

  /* ── BETA GATE: Clans ship as a visible-but-gated "Coming Soon" roadmap
     feature (game-designer ruling, 2026-08-17). Two facts must hold:
       (a) the panel renders the intentional coming-soon card (no empty room,
           no reachable treasury/browser), and
       (b) contribute() is hard-disabled — it moves NO gold and issues NO
           request, because it debits G.gold client-side against a server RPC
           that mints with no debit (server-authority lock).
     If clan pass-2 flips CLAN_LAUNCHED, this test is expected to be updated. */
  () => tryRun('beta-gate: the Clan panel shows the coming-soon card and contribute is a gold-safe no-op', () => {
    const Cl = window.HearthriseClans;
    assert(Cl && typeof Cl.clanLaunched === 'function', 'HearthriseClans.clanLaunched must be published');
    assert(Cl.clanLaunched() === false, 'the beta clan gate must be CLOSED (CLAN_LAUNCHED === false)');
    assert(typeof Cl.contribute === 'function', 'HearthriseClans.contribute must be published');

    // (a) the panel renders the coming-soon card, for a signed-in player.
    const host = document.getElementById('clan-panel');
    assert(host, 'the Clan Seat has no render host (#clan-panel)');
    const realGetSession = window.HearthriseAuth && window.HearthriseAuth.getSession;
    try {
      if (window.HearthriseAuth) window.HearthriseAuth.getSession =
        () => ({ access_token: 'probe-token', user: { id: 'probe-user' } });
      if (typeof window.renderClan === 'function') { const r = window.renderClan(); if (r && r.catch) r.catch(() => {}); }
      const card = host.querySelector('.clan-soon');
      assert(card, 'the gated Clan panel must render the .clan-soon roadmap card');
      assert(/Clans/i.test(card.textContent) && /coming/i.test(card.textContent),
        'the coming-soon card must name Clans and read as a roadmap feature');
      // Nothing value-crossing or clan-founding is reachable behind the card.
      assert(!host.querySelector('.clan-found'), 'no founding form may be reachable while gated');
      assert(!host.querySelector('[onclick*="contribute"]'), 'no contribute control may be reachable while gated');
    } finally {
      if (window.HearthriseAuth && realGetSession) window.HearthriseAuth.getSession = realGetSession;
    }

    // (b) contribute() moves no gold and issues no request while gated.
    const G = window.G || (window.G = {});
    const goldBefore = G.gold = 100000;
    const calls = [];
    const realFetch = window.fetch, realNotify = window.notify;
    try {
      window.notify = () => {};
      window.fetch = function (url, opts) { calls.push(String(url)); return realFetch.apply(this, arguments); };
      const p = Cl.contribute(5000);
      if (p && typeof p.catch === 'function') p.catch(() => {});
      assert(G.gold === goldBefore, 'a gated contribute must not debit gold, saw ' + G.gold + ' (was ' + goldBefore + ')');
      assert(calls.length === 0, 'a gated contribute must issue no request, saw ' + calls.length);
    } finally {
      window.fetch = realFetch;
      window.notify = realNotify;
    }
  }),

  /* ── BETA GATE (b385): the gate is no longer just the clan PANEL. Every
     clan-branded surface — the weekly clan boss / Hunt raid, the muster, and the
     dungeon-strip clan-boss shortcut — must present the SAME coming-soon card
     while CLAN_LAUNCHED is false, and render NOTHING functional (no Strike /
     Claim / Declare / Join / Rally). The b378 gate only covered the panel +
     contribute()/feast, so these leaked past it and presented as broken
     (unclaimable chest, un-resetting boss). All behind the one flag. */
  () => tryRun('beta-gate b385: raid, muster and clan-boss shortcut all render the coming-soon card (no functional clan control)', () => {
    const Cl = window.HearthriseClans;
    assert(Cl && typeof Cl.clanLaunched === 'function', 'HearthriseClans.clanLaunched must be published');
    assert(Cl.clanLaunched() === false, 'the beta clan gate must be CLOSED (CLAN_LAUNCHED === false)');
    assert(typeof Cl.comingSoonHtml === 'function', 'HearthriseClans.comingSoonHtml (the shared idiom) must be published');

    const Mu = window.HearthriseMuster;
    const Ra = window.HearthriseRaids;
    assert(Mu && typeof Mu._ensurePanel === 'function' && typeof Mu._renderMusterCard === 'function',
      'muster test seams (_ensurePanel/_renderMusterCard) must be published');
    assert(Ra && typeof Ra.render === 'function', 'HearthriseRaids.render must be published');

    // Build the Events panel — the destination the dungeon-strip clan-boss
    // shortcut ("Events" button) navigates to — and render its clan surfaces.
    const panel = Mu._ensurePanel();
    assert(panel, 'the Events panel must be creatable');

    // (a) the weekly clan boss / Hunt raid → coming-soon, no functional control.
    const rp = Ra.render(); if (rp && rp.catch) rp.catch(() => {});
    const raidSlot = document.getElementById('hr-events-raid');
    assert(raidSlot, 'the Events panel must host the weekly-clan-boss slot');
    const raidCard = raidSlot.querySelector('.clan-soon');
    assert(raidCard, 'the gated weekly clan boss must render the .clan-soon coming-soon card');
    assert(/coming/i.test(raidCard.textContent), 'the raid card must read as a roadmap feature');
    assert(!raidSlot.querySelector('[onclick*="HearthriseRaids"]'),
      'no Strike/Claim/Declare control may be reachable on the gated weekly clan boss');
    assert(!raidSlot.querySelector('.btn-primary'),
      'no primary action may render on the gated weekly clan boss');

    // (b) the muster card → coming-soon, no Join/Rally/Claim.
    Mu._renderMusterCard();
    const muHost = document.getElementById('hr-muster-card');
    assert(muHost, 'the Events panel must host the muster card');
    const muCard = muHost.querySelector('.clan-soon');
    assert(muCard, 'the gated muster must render the .clan-soon coming-soon card');
    assert(/coming/i.test(muCard.textContent), 'the muster card must read as a roadmap feature');
    assert(!muHost.querySelector('[data-mu]'),
      'no Join/Rally/Claim control may be reachable on the gated muster');
    assert(!muHost.querySelector('.btn-primary'),
      'no primary action may render on the gated muster');
  }),

  () => tryRun('b330: the kick control sends clan_kick with a CLAMPED ban, and the default is 168h', () => {
    const Cl = window.HearthriseClans;
    assert(Cl && typeof Cl.kick === 'function', 'HearthriseClans.kick must be published');
    const UI = window.HearthriseClanSeatUI;
    assert(UI && Array.isArray(UI.BAN_CHOICES) && UI.BAN_CHOICES.length,
      'the panel must OFFER the ban duration rather than hiding it');
    assert(+UI.BAN_CHOICES[0].value === 168,
      'the default (first) ban choice must be the server default of 168h, got ' + UI.BAN_CHOICES[0].value);
    UI.BAN_CHOICES.forEach((b) => assert(+b.value >= 0 && +b.value <= 720,
      'every offered ban must be inside the server clamp 0…720h, got ' + b.value));

    const calls = [];
    const realFetch = window.fetch;
    const sb = window.HearthriseSupabase, au = window.HearthriseAuth;
    const realGetConfig = sb && sb.getConfig, realGetSession = au && au.getSession;
    const realNotify = window.notify;
    try {
      if (sb) sb.getConfig = () => ({ url: 'https://probe.invalid', anonKey: 'anon-probe-key' });
      if (au) au.getSession = () => ({ access_token: 'probe-token', user: { id: 'probe-user' } });
      window.notify = () => {};
      window.fetch = function (url, opts) {
        calls.push({ url: String(url), opts: opts || {} });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
      };
      const p = Cl.kick('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 99999);
      if (p && typeof p.catch === 'function') p.catch(() => {});
      assert(calls.length === 1, 'a kick must issue exactly one request, saw ' + calls.length);
      assert(calls[0].url.indexOf('/rest/v1/rpc/clan_kick') !== -1,
        'a removal must go through the clan_kick RPC: ' + calls[0].url);
      const body = JSON.parse(calls[0].opts.body || '{}');
      assert(body.p_user_id === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'the target is p_user_id');
      assert(body.p_ban_hours === 720,
        'a client ban duration is CLAMPED to 720h before it is sent, got ' + body.p_ban_hours);
    } finally {
      window.fetch = realFetch;
      window.notify = realNotify;
      if (sb && realGetConfig) sb.getConfig = realGetConfig;
      if (au && realGetSession) au.getSession = realGetSession;
    }
  }),

  () => tryRun('b330: every refusal the membership RPCs can return reads as a sentence, never a code', () => {
    const Cl = window.HearthriseClans;
    assert(Cl && typeof Cl.errorText === 'function',
      'the code→sentence mapping must be published, or nothing can prove a refusal reads as one');
    /* Every `error` string the eight RPCs in 2026-08-11-clan-membership-authority.sql
       can return. If a future migration adds one, add it here — an unmapped code
       reaches the player as "Could not join (some_code)". */
    const CODES = ['not_signed_in', 'rate_limited', 'no_clan', 'already_in_clan', 'invite_only',
      'banned', 'clan_full', 'bad_name', 'name_taken', 'bad_policy', 'not_member', 'not_permitted',
      'cannot_kick_self', 'cannot_kick_leader', 'no_such_player', 'cannot_invite_self',
      'target_in_clan', 'already_member', 'no_target'];
    CODES.forEach((code) => {
      const txt = Cl.errorText(code, 'Could not join', 403);
      assert(typeof txt === 'string' && txt.length > 8,
        'the refusal for "' + code + '" must be a sentence, got: ' + txt);
      assert(txt.indexOf(code) === -1,
        'the refusal for "' + code + '" leaked the raw code to the player: ' + txt);
      assert(txt.indexOf('403') === -1 && !/\(\d+\)/.test(txt),
        'the refusal for "' + code + '" leaked an HTTP status: ' + txt);
    });
    // …and an UNKNOWN code must NOT be dressed up as a sentence we never verified.
    const unknown = Cl.errorText('__not_a_real_code__', 'Could not join', 403);
    assert(unknown.indexOf('__not_a_real_code__') >= 0,
      'an unrecognised code must be shown verbatim rather than guessed at, got: ' + unknown);
  }),

  () => tryRun('b330: the Great Hall carries the door, invitations and removals — for leadership only', () => {
    const UI = window.HearthriseClanSeatUI;
    if (!UI || typeof UI.roomDescriptor !== 'function') { skip('seam absent'); return; }
    const ROSTER = [
      { user_id: 'u-lead', role: 'leader', contributed: 10, profiles: { display_name: 'Leader' } },
      { user_id: 'u-mem', role: 'member', contributed: 5, profiles: { display_name: 'Rank And File' } }
    ];
    try {
      // ── AS THE LEADER ──────────────────────────────────────────────────
      UI._reset();
      UI._setClan({ id: 'clan-1', name: 'Probe Hold', level: 1, treasury: 0, join_policy: 'open', myRole: 'leader' });
      UI._setSeat({ castle_tier: 1, standing: 0, upgrades: {}, my_role: 'leader', members: 2, member_cap: 10,
        stores: {}, orders: [], upkeep_state: 'active' }, 'clan-1');
      UI._setRoster(ROSTER);
      UI._setInvites([{ user_id: 'u-inv', display_name: 'Invited Soul', at: Date.now() - 3600000,
        expires_at: new Date(Date.now() + 6 * 86400000).toISOString() }]);
      let d = UI.roomDescriptor('great_hall');
      let json = JSON.stringify(d.sections);

      assert(d.sections.some((s) => s.title === 'The door'), 'leadership must be able to set the join policy');
      const door = d.sections.filter((s) => s.title === 'The door')[0];
      assert(door.select && door.select.value === 'open',
        'the door control must OPEN ON the hold\'s current policy, got ' + (door.select && door.select.value));
      assert(door.select.options.map((o) => o.value).join(',') === 'open,invite',
        'the door offers exactly the two policies the CHECK constraint allows');
      assert(door.button && door.button.action === 'door-set', 'the door must have a control that acts');

      assert(d.sections.some((s) => s.title === 'Invite a player'), 'leadership must be able to invite');
      const inv = d.sections.filter((s) => s.title === 'Invite a player')[0];
      assert(inv.text && inv.text.name === 'invite', 'inviting takes a display name typed in');
      assert(inv.button.action === 'invite-send', 'the invite field must have a control that acts');

      const out = d.sections.filter((s) => s.title === 'Invitations outstanding')[0];
      assert(out, 'leadership must see outstanding invitations');
      assert(out.rows.length === 1 && /Invited Soul/.test(out.rows[0].name),
        'the outstanding list must name the invited player');
      assert(/data-cs="invite-revoke"/.test(out.rows[0].right), 'each outstanding invitation must be revocable');

      assert(d.sections.some((s) => s.title === 'Removals'), 'the ban duration must be SURFACED, not hidden');
      /* THE REMEDY. The whole point of the migration: a leader can remove the
         rank-and-file member, and cannot remove the leader or themselves. */
      const roster = d.sections.filter((s) => s.title === 'Those sworn to the hold')[0];
      const rows = roster.rows;
      assert(/data-cs="kick"[^>]*data-u="u-mem"/.test(rows[1].right),
        'leadership must have a Remove control on an ordinary member: ' + rows[1].right);
      assert(!/data-cs="kick"/.test(rows[0].right),
        'the leader must not be offered for removal — the server refuses it (cannot_kick_leader)');
      // The removal is two-step: armed first, acted on second.
      assert(/>Remove<\/button>/.test(rows[1].right), 'an unarmed Remove must read as Remove');
      UI._setKickArm('u-mem');
      const armed = UI.roomDescriptor('great_hall').sections
        .filter((s) => s.title === 'Those sworn to the hold')[0].rows[1].right;
      assert(/confirm/i.test(armed) && /btn-danger/.test(armed),
        'an armed Remove must ask for confirmation and read as destructive: ' + armed);

      // ── AS A RANK-AND-FILE MEMBER ─────────────────────────────────────
      UI._setKickArm(null);
      UI._setClan({ id: 'clan-1', name: 'Probe Hold', level: 1, treasury: 0, join_policy: 'invite', myRole: 'member' });
      UI._setSeat({ castle_tier: 1, standing: 0, upgrades: {}, my_role: 'member', members: 2, member_cap: 10,
        stores: {}, orders: [], upkeep_state: 'active' }, 'clan-1');
      d = UI.roomDescriptor('great_hall');
      json = JSON.stringify(d.sections);
      assert(!d.sections.some((s) => s.title === 'Invite a player'),
        'a member must not be shown an invite control the server would refuse (not_permitted)');
      assert(!d.sections.some((s) => s.title === 'Removals'),
        'a member must not be shown a removals control');
      assert(!/data-cs="kick"/.test(json), 'a member must have no kick button anywhere');
      assert(!/data-cs="door-set"/.test(json), 'a member must not be offered the door switch');
      assert(/invite only/i.test(json), 'a member must still be TOLD what the hold\'s door is set to');
    } finally { UI._reset(); }
  }),

  /* b330 — found by DRIVING the panel in a browser, not by reading it. The
     two-step Remove arms on the first click, and arming repaints the modal; the
     repaint rebuilt every control from its descriptor, so a leader who chose a
     24-hour bar and then clicked Remove sent 168. The choice was silently
     reverted between the two halves of one action. Fixed in the repaint itself
     (paint() already preserved scrollTop for the same reason), so the whole
     control family is covered — including the Storehouse's deposit picker,
     which had the same defect and nobody had noticed. */
  () => tryRun('b330: a room repaint preserves what the player typed or picked', () => {
    const RM = window.HearthriseRoomModal;
    if (!RM || typeof RM.open !== 'function') { skip('seam absent'); return; }
    try {
      const descriptor = () => ({
        id: 'probe', theme: 'hall', title: 'Probe', sections: [
          { kind: 'field', title: 'Pick', select: { name: 'probe', options: [
            { value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' } ] } },
          { kind: 'field', title: 'Type', text: { name: 'probetxt', placeholder: 'name' } }
        ]
      });
      RM.open(descriptor);
      const sel = document.querySelector('[data-cs-sel="probe"]');
      const txt = document.querySelector('[data-cs-txt="probetxt"]');
      assert(sel && txt, 'the probe descriptor must render a select and a text field');
      assert(sel.value === 'a', 'a select with no explicit value opens on its first option');
      sel.value = 'c';
      txt.value = 'Half A Name';

      RM.refresh();                       // exactly what arming a button does

      const sel2 = document.querySelector('[data-cs-sel="probe"]');
      const txt2 = document.querySelector('[data-cs-txt="probetxt"]');
      assert(sel2 && sel2 !== sel, 'refresh must genuinely rebuild the modal, or this proves nothing');
      assert(sel2.value === 'c',
        'a repaint must not revert a chosen value — that sent a 7-day ban when 24 hours was picked, got ' + sel2.value);
      assert(txt2.value === 'Half A Name',
        'a repaint must not erase a half-typed name, got: ' + txt2.value);

      // …but a value the rebuilt control no longer offers must NOT be forced on.
      RM.open(() => ({ id: 'probe', theme: 'hall', title: 'Probe', sections: [
        { kind: 'field', title: 'Pick', select: { name: 'probe', options: [{ value: 'a', label: 'A' }] } } ] }));
      const sel3 = document.querySelector('[data-cs-sel="probe"]');
      assert(sel3.value === 'a',
        'a restored value that the new option list does not contain must be dropped, got: ' + sel3.value);
    } finally { RM.close(); }
  }),

  () => tryRun('b330: an invited player is told, and is offered only what the server can actually do', () => {
    const Cl = window.HearthriseClans;
    if (!Cl || typeof Cl._inviteInboxHtml !== 'function') { skip('seam absent'); return; }
    const html = Cl._inviteInboxHtml([{
      invite_id: 'i1', clan_id: 'c-1', clan_name: 'Emberfall Watch', members: 4,
      invited_by: 'Someone', expires_at: new Date(Date.now() + 6 * 86400000).toISOString()
    }]);
    assert(/Emberfall Watch/.test(html), 'the invitation must name the hold');
    assert(/Someone/.test(html), 'it must say who invited you');
    assert(/lapses in 6 days/.test(html), 'it must say how long it lasts, got: ' + html);
    assert(/joinById\('c-1'\)/.test(html), 'accepting must go through joinById, which is the clan_join RPC');
    /* There is no clan_invite_decline RPC. A Decline button would be a control
       that cannot do what it says — the exact class of lie this pass exists to
       remove — so the copy states the truth instead. */
    assert(!/decline/i.test(html), 'no Decline control may be drawn: the server has no decline path');
    assert(/lapses on its own/i.test(html), 'the player must be told what happens if they do nothing');
    // XSS: a hold name is another player's text and it reaches this markup.
    const evil = Cl._inviteInboxHtml([{ clan_id: 'c-2', clan_name: '<img src=x onerror=alert(1)>',
      expires_at: new Date(Date.now() + 86400000).toISOString() }]);
    assert(evil.indexOf('<img') === -1, 'a hold name must be escaped before it reaches the inbox');
  }),

  /* ── b329 regression suite — XARN'S AUTO-EAT (live bug, b324) ─────────────
     Reported: "When I have 60%-100% threshold activated, it always starts
     healing when I am below 50% HP once, and does not heal up to the %
     threshold."

     Half of that was real. The TRIGGER genuinely ignored the setting: the
     Settings › Gameplay slider wrote `G.settings.autoEatPct` + `G.autoEatPct`,
     and NOTHING reads those. The engine (HearthriseAuto.maybeAutoEat) triggers
     on `G.autoActions.eat.threshold`, which `ensureShape()` seeds from
     `G.autoEatPct` exactly once — at the moment the branch is first created.
     So for every player whose save already had an `eat` branch, the slider was
     an inert control and auto-eat kept firing at the 50% default forever. Two
     writers, one reader, and they never met.

     The SECOND half is not a bug — it is the design, and now the description
     says so out loud. Auto-eat spends ONE Provision per swing (combat-sim
     calls fx.autoEat once per tick, live and away identically). It therefore
     climbs back to the threshold over several swings rather than in one gulp.
     That cap is deliberate: it is what makes food a real cost and what keeps
     away accrual byte-identical to live play. Any "heal to threshold in one
     swing" upgrade is a DESIGN change for the Game Designer, not a silent
     edit here. */

  () => tryRun('b329: the Settings auto-eat threshold slider actually reaches the engine (Xarn: fires at 50% no matter what I set)', () => {
    const G = window.G;
    const A = window.HearthriseAuto;
    if (!A || typeof window.openSettings !== 'function') { skip('no settings/auto engine'); return; }
    const snap = snapshotG();
    const savedTraits = G.traits, savedSettings = G.settings, savedPct = G.autoEatPct;
    try {
      G.traits = Object.assign({}, G.traits, { auto_eat: true, auto_eat_2: true });  // b459: tier II = the pre-tier behaviour these fixtures assert
      G.settings = Object.assign({}, G.settings || {});
      A.setEat({ enabled: true, foodId: 'cooked_shrimp', threshold: 0.5 });
      G.inventory = Object.assign({}, G.inventory, { cooked_shrimp: 20 });

      // Drive the REAL control the player drove — not the API behind it.
      window.openSettings();
      const el = document.querySelector('#settings-body input[type="range"][data-set="autoEatPct"]');
      assert(el, 'the Gameplay section must expose the auto-eat threshold slider');
      el.value = '0.6';
      el.dispatchEvent(new Event('change', { bubbles: true }));

      assert(Math.abs(A.eatThreshold() - 0.6) < 1e-9,
        'moving the slider to 60% must set the threshold the ENGINE reads, got ' + A.eatThreshold());

      /* The bug, stated as behaviour: at 58% HP — comfortably ABOVE the old
         hardcoded 50% default — auto-eat must fire. Before the fix this
         returned false and the player watched their bag stay full until 50%. */
      G.playerMaxHp = 100; G.playerHp = 58;
      const before = G.inventory.cooked_shrimp;
      assert(A.maybeAutoEat() === true,
        'at 58% HP with a 60% threshold auto-eat MUST fire — it fired at the hardcoded 50% instead');
      assert(G.inventory.cooked_shrimp === before - 1, 'exactly one Provision may be spent per trigger');

      // …and it must still respect the ceiling: at 65% HP nothing is eaten.
      G.playerHp = 65;
      const held = G.inventory.cooked_shrimp;
      assert(A.maybeAutoEat() === false, 'above the threshold auto-eat must not fire');
      assert(G.inventory.cooked_shrimp === held, 'no food may be spent above the threshold');

      /* 0% is a real setting ("never auto-eat"), not a missing one. The old
         `eat.threshold || 0.5` falsy-coalesce silently turned it into 50%. */
      A.setEat({ threshold: 0 });
      G.playerHp = 1;
      assert(A.eatThreshold() === 0, 'a 0% threshold must survive as 0, not fall back to 50%');
      assert(A.maybeAutoEat() === false, 'a 0% threshold means never auto-eat, even at 1 HP');
    } finally {
      const m = document.getElementById('settings-modal'); if (m) m.classList.remove('show');
      G.traits = savedTraits; G.settings = savedSettings; G.autoEatPct = savedPct;
      restoreG(snap);
    }
  }),

  () => tryRun('b329: auto-eat is ONE Provision per swing, and keeps eating until HP is back at the threshold', () => {
    const G = window.G;
    const A = window.HearthriseAuto;
    if (!A) { skip('no auto engine'); return; }
    const snap = snapshotG();
    const savedTraits = G.traits;
    try {
      G.traits = Object.assign({}, G.traits, { auto_eat: true, auto_eat_2: true });  // b459: tier II = the pre-tier behaviour these fixtures assert
      const heals = (window.ITEMS.cooked_shrimp || {}).heals || 0;
      assert(heals > 0, 'cooked_shrimp must heal for this test to mean anything');
      G.inventory = Object.assign({}, G.inventory, { cooked_shrimp: 50 });
      A.setEat({ enabled: true, foodId: 'cooked_shrimp', threshold: 0.8 });

      // A wound that one Provision cannot possibly close in a single bite.
      G.playerMaxHp = heals * 10; G.playerHp = 1;

      // THE CAP: one call spends exactly one food and heals exactly its value.
      const hp0 = G.playerHp, food0 = G.inventory.cooked_shrimp;
      assert(A.maybeAutoEat() === true, 'auto-eat must fire at 1 HP');
      assert(G.inventory.cooked_shrimp === food0 - 1, 'one swing may spend exactly ONE Provision, not a stack');
      assert(G.playerHp === Math.min(G.playerMaxHp, hp0 + heals),
        'one Provision heals exactly its own value — it does not top you to the threshold in one bite');

      // THE RECOVERY: repeated swings climb back to at/above the threshold…
      let swings = 0;
      while (A.maybeAutoEat() && swings < 200) swings++;
      assert(G.playerHp / G.playerMaxHp >= A.eatThreshold(),
        'after auto-eat resolves, HP must sit at or above the configured threshold ('
          + G.playerHp + '/' + G.playerMaxHp + ' vs ' + A.eatThreshold() + ')');
      assert(swings > 1, 'a deep wound must take several swings — proof the per-swing cap is real, not a heal-to-full');
      // …and then STOPS. No over-eating past the threshold.
      const settled = G.inventory.cooked_shrimp;
      assert(A.maybeAutoEat() === false, 'once at the threshold auto-eat must stop');
      assert(G.inventory.cooked_shrimp === settled, 'no Provision may be spent once HP is back at the threshold');
    } finally { G.traits = savedTraits; restoreG(snap); }
  }),

  () => tryRun('b329/PURGE: a stale autoEatPct in an old bag is IGNORED — the threshold is the server\'s column', () => {
    const G = window.G;
    const A = window.HearthriseAuto;
    if (!A) { skip('no auto engine'); return; }
    const snap = snapshotG();
    const savedPct = G.autoEatPct;
    try {
      /* WHAT THIS TEST USED TO GRADE: a one-time adoption of `G.autoEatPct` (the
         b329 dead-slider rescue). The field is DELETED — it was a persisted second
         copy of `player_state.auto_eat_pct`, the column the accrual engine prices
         every settle and every night with, and "the local mirror wins on
         divergence" is the residue-ahead rule in miniature. What the test grades
         now is the opposite property, which is the one that must hold forever. */
      G.autoActions = Object.assign({}, G.autoActions, {
        eat: { enabled: true, threshold: 0.5, foodId: 'cooked_shrimp' },
      });
      G.autoEatPct = 0.6;                       // a stale key from an old bag
      G.traits = Object.assign({}, G.traits, { auto_eat: true, auto_eat_2: true });
      const EX = (typeof A.expressedThreshold === 'function') ? A.expressedThreshold : A.eatThreshold;
      assert(Math.abs(EX() - 0.5) < 1e-9,
        'THE PURGE: a stale G.autoEatPct was adopted over the live preference — got ' + EX());

      // A gesture still wins until the server answers it, and writes no mirror.
      A.setEat({ threshold: 0.35 });
      assert(Math.abs(EX() - 0.35) < 1e-9, 'the player\'s own gesture must still take, got ' + EX());
      assert(G.autoEatPct === 0.6,
        'setEat must not write a G.autoEatPct mirror any more — one number, and it is the column');
    } finally { if (savedPct === undefined) delete G.autoEatPct; else G.autoEatPct = savedPct; restoreG(snap); }
  }),

  () => tryRun('b329: every surface that PRINTS the auto-eat threshold reads the engine value (no second copy)', () => {
    const G = window.G;
    const A = window.HearthriseAuto;
    if (!A || typeof window.openSettings !== 'function') { skip('no settings/auto engine'); return; }
    const snap = snapshotG();
    const savedTraits = G.traits, savedSettings = G.settings, savedPct = G.autoEatPct;
    try {
      G.traits = Object.assign({}, G.traits, { auto_eat: true, auto_eat_2: true });  // b459: tier II = the pre-tier behaviour these fixtures assert
      G.settings = Object.assign({}, G.settings || {}, { autoEatPct: 0.05 });  // a stale copy
      G.autoEatPct = 0.05;                                                     // and its stale mirror
      G.inventory = Object.assign({}, G.inventory, { cooked_shrimp: 5 });
      A.setEat({ enabled: true, foodId: 'cooked_shrimp', threshold: 0.75 });

      window.openSettings();
      const el = document.querySelector('#settings-body input[type="range"][data-set="autoEatPct"]');
      assert(el, 'the Gameplay section must expose the auto-eat threshold slider');
      assert(Math.abs(parseFloat(el.value) - 0.75) < 1e-9,
        'the slider must show the threshold the engine will USE (0.75), not a stale settings copy — got ' + el.value);

      if (typeof window.renderCombat === 'function') {
        G.activeMonster = G.activeMonster || Object.keys(window.MONSTERS || {})[0];
        window.renderCombat();
        const note = document.querySelector('#panel-combat .cbt-food-note');
        if (note) {
          assert(/falls below 75%/.test(note.textContent),
            'the combat note must quote the engine threshold (75%), got: ' + note.textContent);
          assert(/one per swing|each swing/i.test(note.textContent),
            'the description must state the one-Provision-per-swing rule Xarn expected to be heal-to-threshold');
        }
      }
    } finally {
      const m = document.getElementById('settings-modal'); if (m) m.classList.remove('show');
      G.traits = savedTraits; G.settings = savedSettings; G.autoEatPct = savedPct;
      restoreG(snap);
    }
  }),

  /* ── regression: THE AUTO-EAT THRESHOLD LIED (live P2) ────────────────
     MEASURED ON THE QA ACCOUNT: the settings screen said 50% while
     `player_state.auto_eat_pct` was 25, so at 15 max HP the server ate at 3 HP
     and the player fell "with food" at a threshold nobody chose (census: 5 on
     25, 32 on 50). Residue-ahead (§6): the shown threshold and the attended
     tick's came from a local preference clamped by a CLIENT-held trait map while
     the fight used a SERVER column nothing read back down. `autoEatMirrorFixture`
     builds that exact divergence; the two tests below take its two halves. */

  () => tryRun('b533: the auto-eat threshold the player is SHOWN is the server\'s auto_eat_pct', () => {
    if (!autoEatMirrorReady()) { skip('no auto/accrual seam'); return; }
    autoEatMirrorFixture((G, A) => {
      assert(Math.abs(A.eatThreshold() - 0.25) < 1e-9,
        'the effective threshold must be the server\'s 25%, got ' + A.eatThreshold());
      /* ⚠ 2026-09-14 — THERE IS NO `G.autoEatPct` MIRROR TO FOLLOW ANY MORE: the
         field is deleted, and legacy.js's cold-path `fx.autoEat` fallback reads
         the SAME observation this does, straight off
         HearthriseAccrual.serverAutoEatSettings(). One number, one source. */
      assert(typeof G.autoEatPct === 'undefined',
        'eatThreshold() wrote a G.autoEatPct mirror — the purged second copy is back');
      const seen = window.HearthriseAccrual.serverAutoEatSettings();
      assert(seen && seen.pct === 25,
        'the cold path reads the server observation directly; it says ' + JSON.stringify(seen));
      if (typeof window.openSettings !== 'function') return;
      window.openSettings();
      const el = document.querySelector('#settings-body input[type="range"][data-set="autoEatPct"]');
      assert(el, 'the Gameplay section must expose the auto-eat threshold slider');
      assert(Math.abs(parseFloat(el.value) - 0.25) < 1e-9,
        'the slider must sit on the server\'s 25%, not the local 50% — got ' + el.value);
      const shown = el.closest && el.closest('.ss-slider').querySelector('.ss-slider-value');
      assert(shown && shown.textContent.trim() === '25%',
        'the label must READ 25%, the promise the fight keeps — got ' + (shown && shown.textContent));
    });
  }),

  /* The ATTENDED half, and the absent-key fail-safe. BOTH-PATH (§4): the AWAY
     half is this same column read by the server's own engine, so there is no
     client value to disagree with and src/core/auto-eat.js stays untouched. */
  () => tryRun('b533: the attended tick eats at the server threshold, and fails safe to the lowest tier', () => {
    if (!autoEatMirrorReady()) { skip('no auto/accrual seam'); return; }
    autoEatMirrorFixture((G, A, AC) => {
      G.playerMaxHp = 100; G.playerHp = 40;   // under the local 50%, over the server's 25%
      const held = G.inventory.cooked_shrimp;
      assert(A.maybeAutoEat() === false, 'at 40% HP the tick must NOT eat: the server eats at 25%, '
        + 'so a client meal here is a debit the ~90 s settle will not have paid');
      assert(G.inventory.cooked_shrimp === held, 'no Provision may be spent above the server threshold');
      G.playerHp = 20;                        // under the server's 25%
      assert(A.maybeAutoEat() === true, 'at 20% HP the tick must eat — that is what the server does');
      AC.__resetServerAutoEat();              // no key on the envelope at all
      assert(Math.abs(A.eatThreshold() - 0.25) < 1e-9, 'with nothing observed the threshold must fail '
        + 'safe at the LOWEST tier\'s ceiling, never stand on the local 50% — got ' + A.eatThreshold());
      assert(Math.abs(A.getEat().threshold - 0.5) < 1e-9,
        'and the slider position must survive as the thing the player edits and sends UP');
    });
  }),

  /* ── regression: THE AUTO-EAT FOOD LIED, exactly as the threshold did ──
     MEASURED ON THE QA ACCOUNT (user 0a47ba77…, slot 2, 2026-09-14):
     `G.autoActions.eat.foodId` = cooked_shrimp, `player_state.auto_eat_food` =
     turnip. The combat HUD, the picker and the death sheet named one provision;
     the accrual engine — the only thing that eats during a settle or a night —
     ate the other. `auto_eat_food` has been PROJECTED since
     2026-08-15-auto-eat.sql and accrue.js OBSERVED it as the settings-sync
     dedupe anchor; nothing read it back down. CLAUDE.md §6, the same one-way
     mirror that was killed for `auto_eat_pct`, one column across.

     THE FIXTURE ALREADY BUILDS HALF OF IT (local cooked_shrimp); these two add
     the server's disagreeing nomination. The MUTATION LEVER is that turnip heals
     2 and cooked_shrimp heals far more, so an implementation that keeps reading
     the local preference eats the BIGGER meal — measurably the wrong one. */

  () => tryRun('b547: the auto-eat FOOD is the server\'s auto_eat_food — attended tick and every surface', () => {
    if (!autoEatMirrorReady()) { skip('no auto/accrual seam'); return; }
    autoEatMirrorFixture((G, A, AC) => {
      assert(typeof A.eatFoodId === 'function', 'the effective-provision reader must be published');
      G.inventory = Object.assign({}, G.inventory, { cooked_shrimp: 20, turnip: 5 });
      assert(A.getEat().foodId === 'cooked_shrimp', 'fixture: the local preference is cooked_shrimp');
      /* THE SERVER SPEAKS, and its answer is the OTHER food. */
      AC.noteServerAutoEat({ state: { auto_eat_enabled: true, auto_eat_pct: 25, auto_eat_food: 'turnip' } });
      assert(A.eatFoodId() === 'turnip',
        'THE BUG: the effective provision must be the server\'s turnip, got ' + A.eatFoodId());
      assert(A.getEat().foodId === 'cooked_shrimp', 'the LOCAL preference survives untouched');

      /* THE ATTENDED TICK EATS IT. Below the server's 25% with both foods in
         the bag: the meal that leaves the bag is the one the settle will debit. */
      G.playerMaxHp = 100; G.playerHp = 20;
      const shrimp0 = G.inventory.cooked_shrimp, turnip0 = G.inventory.turnip;
      assert(A.maybeAutoEat() === true, 'at 20% HP with food in the bag the tick must eat');
      assert(G.inventory.turnip === turnip0 - 1,
        'THE BUG: the attended tick must spend the SERVER\'s provision (turnip), got turnip='
        + G.inventory.turnip);
      assert((G.inventory.cooked_shrimp || 0) === shrimp0,
        'THE BUG: it spent the local nomination — the client debits one food, the server another');

      /* AND THE SURFACES SAY SO. The combat HUD chip is the one the player reads
         while fighting; it named cooked_shrimp on the live account. */
      if (typeof window.renderCombat === 'function') {
        G.playerHp = 80;
        G.activeMonster = G.activeMonster || Object.keys(window.MONSTERS || {})[0];
        try { window.renderCombat(); } catch (e) {}
        const chip = document.querySelector('#panel-combat .arena-autoeat, .arena-autoeat');
        if (chip) assert(/Turnip/.test(chip.textContent), 'the HUD chip must name the provision the engine eats: ' + chip.textContent);
      }

    });
  }),

  /* THE OBSERVATION SEMANTICS, on their own, because they are where the
     threshold mirror's bugs lived: a stored NULL is a VALUE, an unanswered
     gesture wins until the server speaks, and it is the COUNT that says the
     server spoke — never the value, or an envelope restating what it already
     held would be a non-event and the local pick would win forever. */
  () => tryRun('b547: auto-eat food — NULL means best-in-the-bag, and an unanswered pick loses to the next observation', () => {
    if (!autoEatMirrorReady()) { skip('no auto/accrual seam'); return; }
    autoEatMirrorFixture((G, A, AC) => {
      /* NULL IS A VALUE: "no nomination, eat the best in the bag" — never an
         absence to paper over with the stale local name. */
      AC.noteServerAutoEat({ state: { auto_eat_food: null } });
      assert(A.eatFoodId() === null, 'a stored NULL is best-in-the-bag, never the local nomination');

      /* AN UNANSWERED GESTURE WINS — and only until the server speaks again.
         Without this the picker would paint the old food over the one just
         tapped for the 1.5 s debounce plus a round trip. */
      A.setEat({ foodId: 'cooked_shrimp' });
      assert(A.eatFoodId() === 'cooked_shrimp', 'an unanswered pick holds until the server answers');
      AC.noteServerAutoEat({ state: { auto_eat_food: 'turnip' } });
      assert(A.eatFoodId() === 'turnip', 'a NEW OBSERVATION ends the gesture whatever it carries');
      /* …and a RESTATEMENT of the same value is still the server speaking. */
      A.setEat({ foodId: 'cooked_shrimp' });
      AC.noteServerAutoEat({ state: { auto_eat_food: 'turnip' } });
      assert(A.eatFoodId() === 'turnip',
        'an envelope RESTATING turnip must still overrule an unanswered local pick — comparing '
        + 'values instead of the observation count is the bug surviving its own fix');

      /* NEVER OBSERVED: the local preference is the only honest answer. */
      AC.__resetServerAutoEat();
      assert(A.eatFoodId() === 'cooked_shrimp', 'with nothing observed the local nomination stands');
    });
  }),

  /* THE AWAY HALF (§4 both-path). The night runs the SAME resolveAutoEat through
     the same maybeAutoEat, so the food it eats must be the server's too — the
     away rig, one seeded span, with the two nominations disagreeing. */
  () => tryRun('b547: the AWAY replay eats the server\'s provision too (both-path with the attended tick)', () => {
    const C = window.HearthriseCore, P = window.HearthrisePresence;
    const A = window.HearthriseAuto, S = window.HearthriseCombatSim, AC = window.HearthriseAccrual;
    if (!(C && C.combatSim && S && typeof S.ctx === 'function' && P && typeof P._withOfflineReplay === 'function'
          && A && typeof A.setEat === 'function' && autoEatMirrorReady())) { skip('no away rig'); return; }
    const snap = snapshotG(), origBonus = window.getBonus, beforeEat = A.getEat();
    const sObs = AC.serverAutoEatSettings();
    let wasParked = false, wasSync = false;
    try {
      wasSync = (typeof A._parkEatSync === 'function') ? A._parkEatSync(true) : false;
      wasParked = A._parkAutoEatMirror(false);
      window.getBonus = () => 0;
      const G = window.G, m = window.MONSTERS.wolf;
      G.buffs = []; G.quests = []; G.recoveringUntilMs = 0; G.playerMaxHp = 40; G.playerHp = 40;
      G.skills = Object.assign({}, G.skills, { attack: 3000, strength: 3000, defense: 0, hitpoints: 5000 });
      G.inventory = Object.assign({}, G.inventory, { cooked_shrimp: 500, turnip: 500 });
      G.traits = Object.assign({}, G.traits, { auto_eat: true, auto_eat_2: true });
      G.stats = Object.assign({}, G.stats, { kills: 0, crits: 0, deaths: 0, rareDrops: 0 });
      A.setEat({ foodId: 'cooked_shrimp', enabled: true, threshold: 0.6 });
      AC.noteServerAutoEat({ state: { auto_eat_enabled: true, auto_eat_pct: 60, auto_eat_food: 'turnip' } });
      const shrimp0 = G.inventory.cooked_shrimp, turnip0 = G.inventory.turnip;
      G.activeMonster = 'wolf'; G.monsterHp = m.hp; G.monsterMaxHp = m.hp;
      C.reseed(0x547AEA7);
      P._withOfflineReplay(() => {
        const ctx = S.ctx();
        for (let i = 0; i < 600 && G.playerHp > 0; i++) {
          if (!G.activeMonster) { G.activeMonster = 'wolf'; G.monsterHp = m.hp; G.monsterMaxHp = m.hp; }
          C.combatSim.simulateTick(G, ctx);
        }
      });
      const ateTurnip = turnip0 - (Number(G.inventory.turnip) || 0);
      const ateShrimp = shrimp0 - (Number(G.inventory.cooked_shrimp) || 0);
      assert(ateTurnip > 0, 'the away replay must auto-eat at all (ate ' + ateTurnip + ' turnip)');
      assert(ateShrimp === 0, 'THE BUG: the away path ate the LOCAL nomination — ' + ateShrimp + ' cooked_shrimp');
    } finally {
      window.getBonus = origBonus;
      try { AC.__noteAutoEatSettings(sObs); } catch (e) {}
      try { A.setEat(beforeEat); } catch (e) {}
      try { A._parkAutoEatMirror(wasParked); } catch (e) {}
      if (typeof A._parkEatSync === 'function') A._parkEatSync(wasSync);
      restoreG(snap);
    }
  }),

  /* ── regression: THE PLAY STREAK LIED (live P3) ──────────────────────
     MEASURED on the same account the same hour: the topbar flame read 1 while
     `player_state.streak_days` held 3. `G.streak` is a per-DEVICE residue
     legacy.js advances from the local clock, so a second machine or a cleared
     profile restarts it at 1 while the server keeps counting from `accrued_to`
     (2026-08-21-streak-state.sql §4c). The number is spendable — renown scores
     `streakBest` ×5 off that exact column server-side — so two counters under
     one word is §6 verbatim. */
  () => tryRun('b547: the play streak shown is the server\'s streak_days, not the per-device residue', () => {
    const AC = window.HearthriseAccrual;
    if (!(AC && typeof AC.reconcilePlayStreak === 'function' && typeof AC.playStreakDays === 'function')) {
      skip('no play-streak seam'); return;
    }
    const G = window.G, snap = snapshotG();
    const hadSrv = Object.prototype.hasOwnProperty.call(G, '_serverStreak');
    const prevSrv = G._serverStreak, prevStreak = G.streak;   // neither is in snapshotG
    try {
      delete G._serverStreak;
      /* A stale bag key from before the purge. It is not on RESIDUE_FIELDS any
         more, and — the point — it answers NOTHING: with no envelope the honest
         reading is "the realm has not counted yet", never a device-clock 1. */
      G.streak = { count: 1, lastDay: 20260914 };
      assert(AC.playStreakDays(G) === 0,
        'THE PURGE: with no envelope the play streak must read 0, not the device counter — got '
        + AC.playStreakDays(G));

      const r = AC.reconcilePlayStreak(G, { state: { streak_days: 3, streak_day_key: '2026-09-14' } });
      assert(r && r.mode === 'server' && r.days === 3, 'the projection must be recorded, got ' + JSON.stringify(r));
      assert(G._serverStreak && G._serverStreak.days === 3 && G._serverStreak.dayKey === '2026-09-14',
        'it lands in `_` SCRATCH, never the residue: ' + JSON.stringify(G._serverStreak));
      assert(AC.playStreakDays(G) === 3,
        'THE BUG: the reader must prefer the server\'s 3 over the device\'s 1, got ' + AC.playStreakDays(G));
      assert(G.streak.count === 1, 'and the stale bag key is left exactly as it was — no upward merge');

      /* NEVER AN EVICTION: an envelope without the key leaves the observation alone. */
      AC.reconcilePlayStreak(G, { state: {} });
      assert(AC.playStreakDays(G) === 3, 'an envelope without streak_days must not clear the observation');

      /* THE FLAME CHIP — the surface that lied. */
      const el = document.getElementById('top-streak-count');
      const SC = window.HearthriseStreakChip;
      if (el && SC && typeof SC.paint === 'function') {
        /* The PAINTER, called directly: legacy's render hooks defer paintAll
           through setTimeout(0), which a synchronous assertion would race. */
        try { SC.paint(G); } catch (e) {}
        assert(el.textContent.trim() === '3',
          'the topbar flame must read the server\'s 3, got "' + el.textContent.trim()
          + '" (the reader says ' + (typeof window.hrPlayStreakDays === 'function'
            ? window.hrPlayStreakDays() : 'absent') + ')');
        assert(el.parentElement.classList.contains('hot'), 'the 3-day "hot" state keys off it too');
      }

      /* AND RENOWN, which SPENDS it: 5 points a day of disagreement. */
      const R = window.HearthriseRenown;
      if (R && typeof R.compute === 'function' && R.WEIGHTS) {
        const withSrv = R.compute(G);
        delete G._serverStreak;
        const withNone = R.compute(G);
        G._serverStreak = { days: 3, dayKey: '2026-09-14', at: Date.now() };
        assert(withSrv - withNone === 3 * R.WEIGHTS.streakBest,
          'renown must score the server\'s streak and NOTHING when it has not spoken (three days × '
          + R.WEIGHTS.streakBest + '), got a difference of ' + (withSrv - withNone));
      }
    } finally {
      if (hadSrv) G._serverStreak = prevSrv; else delete G._serverStreak;
      G.streak = prevStreak;
      try { if (SC && typeof SC.paint === 'function') SC.paint(G); } catch (e) {}
      restoreG(snap);
    }
  }),

  /* ── regression: THE ENGINE UNDER THE TWO TESTS ABOVE ────────────────
     Those fixed the threshold SYMPTOM. What let a client stand on a tier it
     never bought is one line up the stack: a trait written into `G.traits` by a
     stale residue, a suite leak, an optimistically painted refusal or devtools
     outlived a server that never sold it — the residue-ahead class (§6) with a
     paid entitlement on it. Gates freed: hasTrait() (shop, combat food controls,
     inv-context-menu, combat-render) and autoEatTier() (settings threshold
     slider, the auto-eat engine, death sheet, fight warning, set-the-night). */
  () => tryRun('b536: a trait the server does not project is REVOKED — a client-only tier cannot gate a server capability', () => {
    const AC = window.HearthriseAccrual;
    const AE = window.HearthriseCore && window.HearthriseCore.autoEat;
    assert(AC && typeof AC.reconcileTraits === 'function',
      'reconcileTraits is the ONE seam that homes G.traits — without it traits are stranded');
    assert(AE && typeof AE.autoEatTier === 'function' && typeof AE.maxPctForTier === 'function',
      'src/core/auto-eat.js is the ONE tier reader every trait gate funnels through');
    assert(typeof window.hasTrait === 'function', 'legacy hasTrait() is the other trait gate');
    const G = window.G;
    const snap = snapshotG();
    try {
      /* THE LIE, as the live one arrives: a tier-II trait map NO server row backs. */
      G.traits = { auto_eat: true, auto_eat_2: true };
      assert(AE.autoEatTier(G.traits) === 2 && window.hasTrait('auto_eat_2') === true,
        'fixture: the client must start out believing it owns tier II');
      assert(AE.maxPctForTier(AE.autoEatTier(G.traits)) === 100,
        'fixture: tier II is the 100% ceiling — that is the capability being gated');

      // hr_state_of builds `traits` UNFILTERED, `[]` KNOWN: "bought nothing", not a partial.
      const r = AC.reconcileTraits(G, { traits: [] });
      assert(r && r.mode === 'server' && r.removed === 2,
        'THE BUG: the hydration was a UNION — it left both invented traits standing; got '
        + JSON.stringify(r));
      assert(window.hasTrait('auto_eat') === false && window.hasTrait('auto_eat_2') === false,
        'THE BUG: hasTrait() still answers YES for a trait the server never sold, so the Bounty '
        + 'Shop row, the combat food controls and the death sheet all stay unlocked');
      assert(AE.autoEatTier(G.traits || {}) === 0 && AE.maxPctForTier(AE.autoEatTier(G.traits || {})) === 25,
        'the gated surface must read locked / lowest tier, never the invented tier-II ceiling');

      const r2 = AC.reconcileTraits(G, { traits: ['auto_eat'] });
      assert(r2 && r2.added === 1 && window.hasTrait('auto_eat') === true
        && AE.autoEatTier(G.traits) === 1,
        'a projected trait must unlock its surface — this is a mirror, not a wipe; got '
        + JSON.stringify(r2));
      assert(window.hasTrait('auto_eat_2') === false,
        'and ONLY what the server named — tier II was not projected');

      // NEVER EVICT ON UNCERTAINTY (§6): no `traits` key = unreadable, not "you own nothing".
      const r3 = AC.reconcileTraits(G, { state: {} });
      assert(r3 && r3.mode === 'absent' && window.hasTrait('auto_eat') === true,
        'an envelope that does not project traits must leave the owned set exactly alone');
    } finally { restoreG(snap); }
  }),

  /* ── b331 regression suite — THE DEAD-TOKEN LOOP (live P0) ────────────────
     A player played for 3+ hours and NOTHING reached the cloud. Their only
     game_saves row was 30 hours stale; the whole session existed in one
     browser's localStorage. Production edge logs for that window: 3,087 x HTTP
     401, every one carrying `PostgREST; error=PGRST303` (JWT expired), from one
     IP, continuously — GET game_saves ~every 20s, POST game_events 120/hr, GET
     session_claims 60/hr. The token in those requests was a real access token
     ISSUED THE PREVIOUS DAY (iat 1786461852, exp 1786465452), replayed for
     hours. `/auth/v1/token` saw ~25 requests in the entire 24h, so the refresh
     was not reaching the network at all.

     THE CHAIN, end to end:
       1. auth.js restored `session` from localStorage at boot and handed
          `session.access_token` to every request. NOTHING read `exp`.
       2. `refreshSession()` on a client whose own session is gone rejects with
          AuthSessionMissingError WITHOUT a network call; the handler swallowed
          it in `catch {}`, left `session` untouched, and the retry re-sent the
          same dead token.
       3. `pullLatestDetailed()` used a RAW fetch — the one cloud call that never
          went through the refresh wrapper. Its 401 read as "cloud UNKNOWN".
       4. That correctly holds the b314 snapshot gate closed — and nothing ever
          released it. Which is why not one POST to game_saves appears in three
          hours of logs: the save short-circuited BEFORE the network, forever.

     Note (4): the absent POST is the load-bearing evidence. Everything else was
     merely loud; that was the data loss. */

  () => tryRun('b331: the exact token production replayed for three hours is refused before it reaches the wire', () => {
    const S = window.HearthriseSync;
    assert(typeof S.tokenStatus === 'function', 'sync.js no longer classifies a bearer token by expiry');
    // The incident's token, reconstructed from the logged claims.
    const jwt = (claims) => {
      const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return b64({ alg: 'ES256', typ: 'JWT' }) + '.' + b64(claims) + '.sig';
    };
    const real = jwt({ sub: 'b94fa8c0-3627-426a-9714-69c363f8929c', role: 'authenticated',
                       iat: 1786461852, exp: 1786465452 });
    // Presented at 19:00 UTC the NEXT DAY, which is what the edge logs show.
    assert(S.tokenStatus(real, 1786554000000) === 'expired',
      'a token whose exp passed yesterday must be classed expired, got ' + S.tokenStatus(real, 1786554000000));
    // …and inside its hour it is perfectly usable. A guard that refuses
    // everything protects nothing.
    assert(S.tokenStatus(real, 1786463000000) === 'ok',
      'a live token must still be sent, got ' + S.tokenStatus(real, 1786463000000));
    assert(S.tokenStatus(null) === 'none', 'no token is not an expired token');
    // NEVER lock a player out on a parsing guess: anything we cannot decode is
    // sent and judged by the server.
    assert(S.tokenStatus('not-a-jwt') === 'opaque', 'an undecodable token must be sent, not refused');
    assert(S.tokenStatus('a.b.c') === 'opaque', 'an unparseable payload must be sent, not refused');
    assert(S.tokenStatus(jwt({ sub: 'x' })) === 'opaque', 'a JWT with no exp claim must be sent, not refused');
    // skewMs is what makes auth.js refresh BEFORE the token dies rather than
    // after. Untested it would silently rot into a no-op.
    const soon = jwt({ exp: Math.floor(Date.now() / 1000) + 120 });
    assert(S.tokenStatus(soon) === 'ok', 'a token with 2 minutes left is not expired');
    assert(S.tokenStatus(soon, Date.now(), 300000) === 'expired',
      'a 5-minute skew lead must class a token with 2 minutes left as due for refresh');
  }),

  () => tryRun('b331: three hours of dead auth costs a handful of requests, not 2,160', () => {
    const S = window.HearthriseSync;
    assert(typeof S.authGateStep === 'function' && typeof S.decideAuthGate === 'function',
      'the auth circuit breaker is gone — an expired token can loop unbounded again');
    // Drive the REAL reducer the request paths use, at the REAL 5s flush cadence,
    // for the exact duration of the incident.
    let st = S.newAuthGate();
    let sent = 0, deadAt = -1;
    for (let t = 0; t <= 3 * 3600 * 1000; t += 5000) {
      if (!S.decideAuthGate(st, t).allow) continue;
      sent++;
      st = S.authGateStep(st, 'auth-fail', t);   // the SERVER refusing us: evidence
      if (st.dead && deadAt < 0) deadAt = t;
    }
    // The live incident put ~6 requests a minute on the wire for three hours.
    assert(sent <= 10, 'three hours of failed auth must cost at most a handful of requests, got ' + sent);
    assert(st.dead === true, 'continuous auth failure must TERMINATE, not settle into a loop');
    assert(deadAt >= 0 && deadAt <= 5 * 60 * 1000,
      'the player must be told within ~5 minutes, not three hours; declared dead at ' + deadAt + 'ms');
    // Backoff really backs off, and is capped so it can never become "never".
    assert(S.nextAuthBackoffMs(1) < S.nextAuthBackoffMs(3), 'backoff must grow with the failure streak');
    assert(S.nextAuthBackoffMs(99) === S.AUTH_BACKOFF_MAX_MS, 'backoff must be capped, got ' + S.nextAuthBackoffMs(99));
    // One live response reopens everything — a transient failure must not brick sync.
    const back = S.authGateStep(st, 'ok', 9e9);
    assert(back.dead === false && back.streak === 0 && S.decideAuthGate(back, 9e9).allow,
      'a single authorised response must fully reopen the gate');

    /* REVIEW FIX — the same three hours where the only "failures" are OUR OWN
       CLOCK's opinion (a device running fast reads valid tokens as expired) must
       NEVER terminate. Otherwise b331 simply inverts the incident: a player who
       synced fine before, bricked in 155s by a wrong system clock, with
       re-signing-in unable to clear it because the new token reads expired too. */
    let ck = S.newAuthGate();
    for (let t = 0; t <= 3 * 3600 * 1000; t += 5000) {
      if (!S.decideAuthGate(ck, t).allow) continue;
      ck = S.authGateStep(ck, 'auth-fail-local', t);
    }
    assert(ck.dead === false,
      'a local expiry verdict must NEVER terminate a session on its own — a fast clock would brick a healthy player');
    assert(ck.streak > 0, 'local verdicts must still drive backoff, or the guard is asserting nothing');
    // …and one server refusal is all it takes to make the same streak terminal.
    assert(S.authGateStep(ck, 'auth-fail', 3 * 3600 * 1000).dead === true,
      'once the SERVER corroborates, the accumulated streak must terminate');
  }),

  () => tryRun('b331: with an expired token, NOT ONE cloud request reaches the network', () => {
    const S = window.HearthriseSync;
    const expired = (() => {
      const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return b64({ alg: 'ES256' }) + '.' + b64({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 3600 }) + '.sig';
    })();
    const realFetch = window.fetch;
    const heldBuffer = S.getEventBuffer();
    let fetched = 0, refreshAsked = 0;
    try {
      window.fetch = function () { fetched++; return Promise.resolve(new Response('{}', { status: 401 })); };
      // The server has already refused us once, so the local expiry verdict is
      // CORROBORATED and may now suppress traffic. (Without that corroboration
      // the correct behaviour is to probe — proved in the clock-skew test below.)
      S.resetAuthGate({ serverFails: 1 });
      // A real allowlisted row, so flush() has something to send.
      S.restoreEventBuffer([{ type: 'questClaim', payload: { id: 'probe' }, ts: Date.now() }]);
      S.__withConfig({
        endpoint: 'https://example.invalid/rest/v1/game_events',
        snapshotEndpoint: 'https://example.invalid/rest/v1/game_saves',
        claimEndpoint: 'https://example.invalid/rest/v1/session_claims',
        apiKey: 'anon', userId: () => 'u1', authToken: () => expired,
        onAuthError: async () => { refreshAsked++; return false; },   // refresh definitively fails
        onSyncFailure: () => {}, onSyncRecovered: () => {}, onAuthExpired: () => {},
      }, () => {
        // Every path the incident hammered. Each returns a promise, but the
        // decision to go on the wire is made SYNCHRONOUSLY, before any await —
        // which is exactly why this can be asserted here.
        S.snapshotIfDue(true, false);
        S.flush();
        S.claimSession();
        S.checkSessionClaim();
        S.pullLatestDetailed();
        S.snapshotIfDue(true, false);
        S.flush();
      });
      assert(fetched === 0,
        'a token we can already prove is dead must never be put on the wire — ' + fetched + ' request(s) went out');
      assert(refreshAsked >= 1, 'a dead token must trigger a refresh attempt, not silence');
      assert(refreshAsked <= 2, 'the refresh must be single-flight, not one per blocked request (asked ' + refreshAsked + 'x)');
      const gate = S.getAuthGate();
      assert(gate.streak >= 1 && gate.allow === false,
        'the breaker must have closed after a dead-token attempt, got ' + JSON.stringify(gate));
    } finally {
      window.fetch = realFetch;
      S.restoreEventBuffer(heldBuffer);
      S.resetAuthGate();
      S.__resetSyncHealth();
    }
  }),

  () => tryRun('b331: dead auth escalates to the player exactly once, through the real save path', () => {
    const S = window.HearthriseSync;
    const expired = (() => {
      const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return b64({ alg: 'ES256' }) + '.' + b64({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 60 }) + '.sig';
    })();
    const realFetch = window.fetch;
    let expiredCalls = 0, failures = [];
    try {
      window.fetch = function () { return Promise.resolve(new Response('{}', { status: 401 })); };
      // One failure short of the terminal state, backoff already elapsed, and
      // the server has genuinely refused us — the only state in which the
      // breaker is allowed to declare a session dead.
      S.resetAuthGate({ streak: S.AUTH_DEAD_AFTER_TRIES - 1, firstAt: Date.now() - 1000, blockedUntil: 0, serverFails: 1 });
      S.__withConfig({
        snapshotEndpoint: 'https://example.invalid/rest/v1/game_saves',
        apiKey: 'anon', userId: () => 'u1', authToken: () => expired,
        onAuthError: async () => false,
        onAuthExpired: () => { expiredCalls++; },
        onSyncFailure: (r) => { failures.push(r); }, onSyncRecovered: () => {},
      }, () => {
        S.snapshotIfDue(true, false);      // tips it over
        S.snapshotIfDue(true, false);      // must NOT re-fire the notice
        S.snapshotIfDue(true, false);
      });
      assert(expiredCalls === 1,
        'the player must be told exactly once that their sign-in died, got ' + expiredCalls + ' notices');
      assert(failures.indexOf('auth-expired') >= 0,
        'sync health must report the terminal reason so the UI can stop saying "Reconnecting", got ' + JSON.stringify(failures));
      assert(S.getAuthGate().dead === true, 'the breaker must latch dead');
      assert(S.decideAuthGate(S.getAuthGate(), Date.now() + 86400000).allow === false,
        'a dead gate must stay shut even a day later — only a real sign-in reopens it');
    } finally {
      window.fetch = realFetch;
      S.resetAuthGate();
      S.__resetSyncHealth();
    }
  }),

  /* REVIEW FIX — THE INVERTED INCIDENT. A client whose clock runs 2h FAST reads
     every freshly-minted token as already expired. The first cut of b331 would
     have blocked the send, refreshed, called the NEW token expired too, and
     latched dead in ~155s — bricking a player whose session was valid the whole
     time and who cannot fix it by signing in again.

     A token whose `exp` is two hours in the past, seen by a correct clock, is
     BIT-FOR-BIT the same input as a valid token seen by a clock two hours fast.
     So that is what this drives — and the server (stubbed 200) says what a real
     server would say about a token that is, in fact, fine. */
  () => tryRun('b331: a client clock 2h fast keeps syncing — a local verdict may never brick a valid session', () => {
    const S = window.HearthriseSync;
    // Valid token, wrong clock: indistinguishable from exp 2h in the past.
    const asSeenByFastClock = (() => {
      const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return b64({ alg: 'ES256' }) + '.' + b64({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 7200 }) + '.sig';
    })();
    const realFetch = window.fetch;
    let fetched = 0;
    try {
      // The server's verdict on this token is 200 — because it is genuinely valid.
      window.fetch = function () { fetched++; return Promise.resolve(new Response('[]', { status: 200 })); };
      S.setClockTrusted(true);
      // Even one failure short of terminal: with NO server corroboration the
      // breaker may not fire, and the request must still go out.
      S.resetAuthGate({ streak: S.AUTH_DEAD_AFTER_TRIES - 1, firstAt: Date.now() - 10 * 60 * 1000, blockedUntil: 0, serverFails: 0 });
      let told = 0;
      S.__withConfig({
        endpoint: 'https://example.invalid/rest/v1/game_events',
        snapshotEndpoint: 'https://example.invalid/rest/v1/game_saves',
        apiKey: 'anon', userId: () => 'u1', authToken: () => asSeenByFastClock,
        onAuthError: async () => true,               // the refresh works fine — the clock is the problem
        onAuthExpired: () => { told++; },
        onSyncFailure: () => {}, onSyncRecovered: () => {},
      }, () => {
        S.snapshotIfDue(true, false);
        S.snapshotIfDue(true, false);
        S.snapshotIfDue(true, false);
      });
      assert(fetched >= 3,
        'a wrong local clock must not stop requests — only ' + fetched + ' of 3 went out');
      assert(told === 0, 'a player whose token is valid must never be told their sign-in expired');
      assert(S.getAuthGate().dead === false,
        'the breaker must NOT terminate on local verdicts alone — that is the incident, inverted');
    } finally {
      window.fetch = realFetch;
      S.setClockTrusted(true);
      S.resetAuthGate();
      S.__resetSyncHealth();
    }
  }),

  () => tryRun('b331: proof that our clock is wrong permanently retires the local expiry veto', () => {
    const S = window.HearthriseSync;
    assert(typeof S.isClockSkewEvidence === 'function', 'the clock-skew rule is gone');
    // The rule: a token WE call expired that the ISSUER just minted, or that the
    // SERVER just accepted, is a statement about this machine.
    assert(S.isClockSkewEvidence('expired', 'refreshed') === true, 'a freshly refreshed "expired" token is proof of skew');
    assert(S.isClockSkewEvidence('expired', 'authorised') === true, 'a 200 with an "expired" token is proof of skew');
    assert(S.isClockSkewEvidence('ok', 'authorised') === false, 'a healthy token is not evidence of anything');
    assert(S.isClockSkewEvidence('expired', 'refused') === false, 'a 401 corroborates the token, it does not exonerate it');

    const expired = (() => {
      const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return b64({ alg: 'ES256' }) + '.' + b64({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 7200 }) + '.sig';
    })();
    const realFetch = window.fetch;
    let fetched = 0;
    try {
      window.fetch = function () { fetched++; return Promise.resolve(new Response('[]', { status: 200 })); };
      // Once the clock is distrusted, the local veto is retired EVEN THOUGH the
      // server has corroborated before — the server is the only authority left.
      S.setClockTrusted(false);
      S.resetAuthGate({ serverFails: 3 });
      S.__withConfig({
        snapshotEndpoint: 'https://example.invalid/rest/v1/game_saves',
        apiKey: 'anon', userId: () => 'u1', authToken: () => expired,
        onAuthError: async () => true, onAuthExpired: () => {},
        onSyncFailure: () => {}, onSyncRecovered: () => {},
      }, () => { S.snapshotIfDue(true, false); });
      assert(fetched === 1, 'a distrusted clock must stop vetoing requests, got ' + fetched);
      assert(S.getAuthGate().clockTrusted === false, 'the distrust latch must be visible in diagnostics');
    } finally {
      window.fetch = realFetch;
      S.setClockTrusted(true);
      S.resetAuthGate();
      S.__resetSyncHealth();
    }
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     b371 — THE CLOUD-SAVE HEALTH LIE

     LIVE, 2026-08-16: a player's header read "Online · cloud save active"
     through FOUR consecutive failed game_saves upserts, while production
     PostgREST was killing write requests ~100x/hour. Not a corner case — the
     common case for a day.

     MECHANISM: one boolean for two different facts. `reportSync(ok)` fired from
     fetchWithAuthRetry on ANY res.ok, and the claim poll + the game_saves READ
     answer 200 while every upsert 503s. So a successful READ re-latched sync
     health true and popped "✅ Back online — progress synced" — while nothing
     had reached the cloud. The three UI strings made it worse by asserting save
     health from the SESSION alone.

     This is that sequence, through the real reportSync/fetch path: 503 on the
     write, 200 on the read, interleaved exactly as production served them.

     MUTATION PROVEN: restore `if (res.ok) reportSync(true)` in
     fetchWithAuthRetry (the pre-b371 line) → the read fires onSyncRecovered and
     the toast assertion goes red. Derive the header claim from the session
     again → the "does not claim active" assertion goes red. */
  () => tryRunAsync('b371: 503 writes + 200 reads must NOT claim "cloud save active" — and no "Back online" toast', async () => {
    const S = window.HearthriseSync;
    assert(typeof S.saveHealthLine === 'function',
      'sync.js no longer exposes a WRITE-health verdict — the header is back to asserting save health from connectivity');
    /* b515 — THE WRITE UNDER TEST IS THE RESIDUE PUT, AND IT ALWAYS SHOULD
       HAVE BEEN. This used to pin `__setBlobRetired(false)` and grade the
       `game_saves` upsert, because that was the branch the health accounting
       had been written against. b515 deleted the upsert (the staged
       `2026-09-07-game-saves-revoke.sql` takes the grant away server-side too),
       so the pin selects a branch that no longer exists and the whole test
       would run against a `snapshotIfDue` that returns before the network.

       `hr_put_client_state` is THE periodic save now, it reports through the
       same `noteSaveOutcome`, and the reported bug — "a 200 on a READ is not a
       saved game" — is about the accounting, not the endpoint. So: unpinned,
       against the shipping write. The one thing that changes is which URL the
       stub sees; every assertion below is untouched. */
    const realFetch = window.fetch;
    const G = window.G;
    const savedSyncedAt = G ? G.cloudSyncedAt : undefined;
    const savedAuth = window.HearthriseAuth;
    let recovered = 0, failures = 0, writes = 0, reads = 0;
    let writeStatus = 503;
    // The b314 reconcile gate would short-circuit the write before the network
    // and make every assertion below vacuous. Release it for the probe, put it
    // back exactly as found.
    const wasHeld = S.isSnapshotHeld();
    try {
      if (wasHeld) S.releaseSnapshots();
      window.fetch = function (u, init) {
        const url = String(u);
        if (!/example\.invalid/.test(url)) return realFetch.apply(this, arguments);
        const method = (init && init.method) || 'GET';
        if (method === 'GET') { reads++; return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })); }
        writes++;
        /* b515: the residue write is an RPC, so a 200 must carry the RPC's own
           `{ok:true}` — `putClientState` reads the BODY, not just the status, and
           a bare `{}` would report the save as failed and make the "a confirmed
           write restores the claim" half unreachable. */
        return Promise.resolve(new Response(
          writeStatus === 200 ? '{"ok":true}' : '{"message":"canceling statement due to statement timeout"}',
          { status: writeStatus }));
      };
      S.setClockTrusted(true);
      S.resetAuthGate();
      S.__resetSyncHealth();
      const cfg = {
        snapshotEndpoint: 'https://example.invalid/rest/v1/game_saves',
        claimEndpoint: null,
        apiKey: 'anon', userId: () => 'u1', authToken: () => 'opaque-token',
        onAuthError: async () => true, onAuthExpired: () => {},
        onSyncFailure: () => { failures++; },
        onSyncRecovered: () => { recovered++; },
        snapshotIntervalMs: 60000,
      };
      await S.__withConfig(cfg, async () => {
        // Production's actual mix: the save fails, the read succeeds, over and over.
        for (let i = 0; i < S.SAVE_FAIL_WARN_STREAK; i++) {
          await S.snapshotIfDue(true, false);
          await S.pullLatestDetailed();
        }
      });
      assert(writes >= S.SAVE_FAIL_WARN_STREAK,
        'the write path never reached the network (' + writes + ' upserts) — the rest of this test would pass vacuously');
      assert(reads >= 1, 'the read path never reached the network — the interference this guards against was not staged');

      const line = S.saveHealthLine();
      assert(!/cloud save active/i.test(line.text),
        'after ' + writes + ' failed upserts the game still claims "' + line.text + '" — a 200 on a READ is not a saved game');
      assert(line.level === 'warn',
        'four consecutive failed saves must reach the explicit warning state, got level=' + line.level + ' (' + line.text + ')');
      assert(/retry/i.test(line.text),
        'the failure copy must say it is RETRYING (upserts are full snapshots and self-heal) — got: ' + line.text);
      assert(!/lost|corrupt|gone/i.test(line.text), 'the copy is alarmist — nothing is lost: ' + line.text);
      assert(recovered === 0,
        'a successful READ popped the "Back online — progress synced" toast while every save was failing — '
        + 'fired ' + recovered + 'x. This is the exact lie the player saw.');
      assert(failures >= 1, 'four failed saves reported no sync failure at all');
      assert(S.getSaveHealth().failStreak >= S.SAVE_FAIL_WARN_STREAK,
        'the write-failure streak is not being counted');

      /* THE SURFACE, not just the verdict. Reach the signed-in branch of the
         header with a stubbed session, because "the data is right" is precisely
         the assertion this repo keeps mistaking for "the player is told the
         truth". */
      const body = document.getElementById('dash-user-body');
      if (body && typeof window.renderProfile === 'function') {
        window.HearthriseAuth = { ...(savedAuth || {}), getSession: () => ({ user: { email: 'probe@example.invalid' } }) };
        try { window.renderProfile(); } catch (e) {}
        assert(!/cloud save active/i.test(body.textContent),
          'the header still says "cloud save active" with four failed upserts behind it: ' + body.textContent.slice(0, 160));
      }

      /* SURFACE 2 — Settings > Account. This one was a HARDCODED string
         ("☁️ Cloud save active · syncing every 30s"), so nothing about the
         session or the network could ever have changed it. */
      if (typeof window.openSettings === 'function') {
        window.HearthriseAuth = { ...(savedAuth || {}), getSession: () => ({ user: { email: 'probe@example.invalid' } }) };
        try { window.openSettings(); } catch (e) {}
        const sBody = document.getElementById('settings-body');
        if (sBody && /probe@example\.invalid/.test(sBody.textContent)) {
          assert(!/cloud save active/i.test(sBody.textContent),
            'Settings still asserts "Cloud save active" from the session alone');
          assert(/retry/i.test(sBody.textContent),
            'Settings says nothing about saves retrying while four upserts have failed');
          /* ⚠ b456 — RED ON PURPOSE. b371 derived the cadence in the auth card
             (settings-page.js ~546: `syncing every ' + everySec + 's'`) but left a
             SECOND hardcoded copy six lines below it:
                 cloudMeta = 'Auto-syncing every 30s — waiting for first round-trip.'
             (settings-page.js ~595, the branch taken when a live session has no
             `G.cloudSyncedAt` yet — i.e. every player's first minute). The game
             syncs every 60s. Derive it from the same `syncCfg.snapshotIntervalMs`
             the line above already reads; do not relax this assertion. */
          assert(!/every 30s/.test(sBody.textContent),
            'Settings still advertises the 30s cadence the game stopped using when snapshotIntervalMs became 60000 '
            + '(the un-derived twin at src/settings-page.js ~595, "Auto-syncing every 30s — waiting for first '
            + 'round-trip.")');
        }
        const modal = document.getElementById('settings-modal');
        if (modal) modal.classList.remove('show');
      }

      /* SURFACE 3 — the home dashboard hearth line. Only renders while the
         profile panel is the active tab, so it is asserted when reachable. */
      if (window.HearthriseHome && typeof window.HearthriseHome.render === 'function') {
        window.HearthriseAuth = { ...(savedAuth || {}), getSession: () => ({ user: { email: 'probe@example.invalid' } }) };
        try { window.HearthriseHome.render(); } catch (e) {}
        const sub = document.querySelector('.hd-sub');
        if (sub && /Online/.test(sub.textContent)) {
          assert(!/cloud save active/i.test(sub.textContent),
            'the home dashboard still claims "cloud save active" with four failed upserts behind it: ' + sub.textContent);
        }
      }

      // …and a real successful upsert restores the claim, exactly once.
      writeStatus = 200;
      await S.__withConfig(cfg, async () => { await S.snapshotIfDue(true, false); });
      const ok = S.saveHealthLine();
      assert(ok.level === 'ok' && /cloud save active/i.test(ok.text),
        'a confirmed game_saves upsert must restore the claim, got level=' + ok.level + ' (' + ok.text + ')');
      assert(recovered === 1, 'recovery must be announced exactly once by the WRITE that earned it, got ' + recovered);
      assert(S.getSaveHealth().failStreak === 0, 'a successful save must clear the failure streak');
    } finally {
      window.fetch = realFetch;
      if (wasHeld) S.holdSnapshots();
      if (savedAuth) window.HearthriseAuth = savedAuth; else try { delete window.HearthriseAuth; } catch (e) {}
      if (G) { if (savedSyncedAt === undefined) delete G.cloudSyncedAt; else G.cloudSyncedAt = savedSyncedAt; }
      S.resetAuthGate();
      S.__resetSyncHealth();
      if (typeof window.renderProfile === 'function') try { window.renderProfile(); } catch (e) {}
      if (window.HearthriseHome && typeof window.HearthriseHome.render === 'function') try { window.HearthriseHome.render(); } catch (e) {}
    }
  }),

  /* b371 — THE GATEWAY CASUALTY.
     Reliability tracing: production PostgREST kills in-flight handlers at a
     steady ~50/hr, unchanged across the compute upgrade (so: not load), and the
     game_saves upsert is the only request of ours long and body-heavy enough to
     be caught mid-flight. That is a transport casualty, not a refusal — the
     same bytes a moment later succeed. So: ONE jittered retry, writes only.
     The two halves that keep it honest, and both are asserted here:
       · retried-and-SUCCEEDED is silent — the player had no problem;
       · retried-and-FAILED is ONE failure toward the N=4 warning, not two, and
         never an unbounded loop against a struggling backend.
     MUTATION PROVEN: drop the `opts.retryWrite` block in fetchWithAuthRetry →
     the silent-recovery half goes red (a failure fires and nothing saves). */
  () => tryRunAsync('b371: a write killed in flight is retried ONCE, silently — and a real outage still counts as one failure', async () => {
    const S = window.HearthriseSync;
    assert(typeof S.isRetryableServerError === 'function', 'the gateway-casualty rule is gone');
    assert(S.isRetryableServerError(503) && S.isRetryableServerError(502) && S.isRetryableServerError(504),
      'a killed/absent gateway answer must be retryable — that is the entire incident');
    assert(!S.isRetryableServerError(500) && !S.isRetryableServerError(400) && !S.isRetryableServerError(409),
      'a REFUSAL must never be retried — that is how one bad request becomes an outage');
    assert(S.writeRetryDelayMs(0) === S.WRITE_RETRY_MIN_MS && S.writeRetryDelayMs(1) === S.WRITE_RETRY_MAX_MS,
      'the retry jitter no longer spans ' + S.WRITE_RETRY_MIN_MS + '–' + S.WRITE_RETRY_MAX_MS + 'ms');

    let attempts = 0, failures = 0, recovered = 0;
    let plan = [503, 200];
    await withResidueWire(() => {
      const status = plan[Math.min(attempts, plan.length - 1)];
      attempts++;
      return Promise.resolve(new Response(status === 200 ? '{"ok":true}' : '{"message":"timeout"}', { status }));
    }, async () => {
      /* ALL FOUR CASES DRIVE THE ONE WRITE THAT EXISTS — the residue PUT, which
         is the only caller passing `fetchWithAuthRetry(..., { retryWrite })`
         since the blob upsert was deleted. (4) is folded in rather than dropped:
         its assertion — a 503 on the periodic save costs two attempts, not one —
         is (1) and (2), against the same endpoint it named. */
      // (1) killed in flight, then fine. The player must never learn of it.
      await S.snapshotIfDue(true, false);
      assert(attempts === 2, 'the killed write was not retried exactly once — ' + attempts + ' attempt(s)');
      assert(failures === 0, 'a transport casualty that immediately succeeded was reported to the player as a save failure');
      assert(recovered === 0, 'nothing broke, so nothing "recovered" — a spurious toast is noise');
      const okLine = S.saveHealthLine();
      assert(okLine.level === 'ok', 'a retried-and-succeeded write must be healthy, got ' + okLine.level);
      assert(S.getLastCloudSaveAt() > 0, 'the successful retry did not record a cloud save');

      // (2) a real outage: both attempts fail. ONE failure, not two, and the
      //     retry must not become a loop.
      attempts = 0; plan = [503, 503];
      await S.snapshotIfDue(true, false);
      assert(attempts === 2, 'a persistent 503 must cost exactly 2 requests per save — got ' + attempts
        + ' (an unbounded retry multiplies load on a backend that is already failing)');
      assert(S.getSaveHealth().failStreak === 1,
        'a retried-and-failed write must count as ONE failure toward the warning, got ' + S.getSaveHealth().failStreak);
      assert(failures === 1, 'the outage must surface exactly once, got ' + failures);

      // (3) a refusal is answered, not retried.
      attempts = 0; plan = [500, 200];
      await S.snapshotIfDue(true, false);
      assert(attempts === 1, 'a 500 is a real answer and must not be retried — got ' + attempts + ' attempts');

      /* (4) THE KEEPALIVE EXEMPTION, and it is the half a fold-in could lose.
         `retryWrite: !keepalive` — on the parting shot there is no page left to
         sleep 500ms in, and a second keepalive body would double-spend the
         browser's small shared inflight quota. So the pagehide save must take
         exactly ONE attempt on the same 503 the cadence save retries.
         MUTATION: make it `retryWrite: true` in sync.js → red here. */
      attempts = 0; plan = [503, 200];
      S.__resetSyncHealth();
      await S.snapshotIfDue(true, true);
      assert(attempts === 1,
        'the pagehide residue save was retried (' + attempts + ' attempts) — there is no page left to wait '
        + 'in and a second keepalive body double-spends the browser quota the parting send depends on');
    }, { onSyncFailure: () => { failures++; }, onSyncRecovered: () => { recovered++; } });
  }),

  /* ══════════════════════════════════════════════════════════════════════════
     Q-1 — THE TAB-CLOSE SAVE MUST SURVIVE THE TAB CLOSING.
     ══════════════════════════════════════════════════════════════════════════
     `snapshotIfDue(true, true)` is the parting save, fired from
     `visibilitychange`→hidden and `pagehide` (src/net/sync.js). The blob upsert
     always set `keepalive` on it; the residue branch that replaced it did not, so
     the parting save was an ordinary fetch the browser cancels the instant the
     document is torn down — up to a full 60s cadence of SELF-ONLY progress lost on
     every tab close and every mobile backgrounding (the whole residue allowlist,
     because the patch is the whole bag).
     The sibling did it right (accrue.js `buildKeepaliveRequest`); this asserts the
     residue write learned the same lesson, that it is OPT-IN (the periodic save
     must not spend the browser's small shared keepalive quota), and that an
     over-quota body degrades to a normal request instead of being rejected
     outright by the Fetch spec's 64 KiB inflight ceiling. */
  () => tryRunAsync('Q-1: the pagehide residue save is keepalive; the 60s cadence save is not', async () => {
    const CS = window.HearthriseClientState;
    assert(CS && typeof CS.buildClientStatePutRequest === 'function',
      'client-state.js must expose buildClientStatePutRequest — the residue init has to be a value the '
      + 'suite can read, or "does the tab-close save survive teardown" is unassertable');
    const B = CS.buildClientStatePutRequest;
    const base = { url: 'https://example.invalid', anonKey: 'anon', jwt: 'jwt', slot: 1, idem: 'fixed-idem' };
    const cadence = B({ stats: { kills: 1 } }, base);
    assert(/\/rest\/v1\/rpc\/hr_put_client_state$/.test(cadence.url), 'the builder must target the residue RPC');
    assert(cadence.init.keepalive !== true,
      'the 60s cadence save must NOT be keepalive — the quota is small, shared and un-abortable, and this '
      + 'save has a whole page lifetime to finish; spending it here starves the send that actually needs it');
    const parting = B({ stats: { kills: 1 } }, Object.assign({ keepalive: true }, base));
    assert(parting.init.keepalive === true,
      'THE BUG (Q-1): the residue save built for pagehide carries no keepalive, so the browser cancels it on '
      + 'teardown and up to 60s of self-only progress is lost on every tab close');
    assert(parting.init.body === cadence.init.body,
      'keepalive must change the FLAG and nothing else — the patch, slot and idem are identical');
    // Over the spec's 64 KiB inflight quota a keepalive fetch REJECTS; it does
    // not degrade. The residue bag's own cap is 256 KiB, four times that, so
    // this is reachable — it must fall back, not throw the save away.
    const huge = B({ chronicle: 'x'.repeat(CS.KEEPALIVE_MAX_BODY_BYTES + 4096) },
      Object.assign({ keepalive: true }, base));
    assert(typeof huge.init.body === 'string' && huge.init.body.length > CS.KEEPALIVE_MAX_BODY_BYTES,
      'the oversize fixture must actually exceed the keepalive quota or it proves nothing');
    assert(huge.init.keepalive !== true,
      'a body over the ' + CS.KEEPALIVE_MAX_BODY_BYTES + ' B keepalive quota must fall back to a normal '
      + 'request — flagged keepalive it is rejected outright and the save is guaranteed lost, not merely at risk');

    // ── AND THE REAL SAVE PATH, END TO END ────────────────────────────────
    const S = window.HearthriseSync;
    const C = window.HearthriseCapstone;
    if (!(S && C && typeof C.isBlobRetired === 'function' && C.isBlobRetired())) {
      skip('capstone not armed in this run — the residue save branch is not the live path here');
      return;
    }
    const residue = C.buildResiduePatch(window.G);
    if (!residue || !Object.keys(residue).length) {
      skip('no residue on G in this run — snapshotIfDue would decline before building a request');
      return;
    }
    const seen = [];
    await withResidueWire((url, init) => { seen.push({ url, keepalive: init && init.keepalive }); }, async (Sy) => {
      await Sy.snapshotIfDue(true, true);
      assert(seen.length === 1, 'the pagehide save must send exactly one request, got ' + seen.length);
      assert(/hr_put_client_state/.test(seen[0].url), 'the armed save must be the residue PUT, got ' + seen[0].url);
      assert(seen[0].keepalive === true,
        'THE BUG (Q-1), end to end: snapshotIfDue(force, keepalive=true) — the visibilitychange/pagehide save — '
        + 'reached the wire WITHOUT keepalive, so the browser kills it on teardown');
      await Sy.snapshotIfDue(true, false);
      assert(seen.length === 2, 'the cadence save must send exactly one request, got ' + (seen.length - 1));
      assert(seen[1].keepalive !== true,
        'keepalive leaked onto the ordinary cadence save — it is opt-in for the parting shot, not global');
    });
  }),

  () => tryRun('b371: the save-health verdict is pure and honest at every age (no surface may hardcode it)', () => {
    const S = window.HearthriseSync;
    const D = S.describeSaveHealth;
    const now = 1000000000;
    assert(D({ lastOkAt: now - 5000, failStreak: 0 }, now).level === 'ok', 'a save 5s ago is healthy');
    assert(D({ lastOkAt: now - (S.SAVE_FRESH_MS + 1000), failStreak: 0 }, now).level === 'stale',
      'a save older than the freshness window may not be reported as active');
    assert(D({ lastOkAt: 0, failStreak: 0 }, now).level === 'unknown',
      'having saved NOTHING yet is not a failure — but it is certainly not "active"');
    assert(!/active/i.test(D({ lastOkAt: 0, failStreak: 0 }, now).text),
      'the pre-first-save state claims success it cannot substantiate');
    // A single transient 503 must not alarm — writes are full snapshots and self-heal.
    for (let n = 1; n < S.SAVE_FAIL_WARN_STREAK; n++) {
      assert(D({ lastOkAt: now - 1000, failStreak: n }, now).level !== 'warn',
        n + ' failure(s) must not reach the warning state — that would scare a player over a hiccup');
    }
    assert(D({ lastOkAt: now - 1000, failStreak: S.SAVE_FAIL_WARN_STREAK }, now).level === 'warn',
      'the warning state must be reachable at N=' + S.SAVE_FAIL_WARN_STREAK);
    assert(/12m ago/.test(D({ lastOkAt: now - 12 * 60000, failStreak: 9 }, now).text),
      'the warning must say HOW LONG it has been — "something is wrong" without an age is not actionable');
  }),

  () => tryRun('b331: after N minutes of dead auth the player is told the truth, not "Reconnecting"', () => {
    const A = window.HearthriseAuth;
    assert(A && typeof A.syncFailureMessage === 'function',
      'auth.js no longer owns the sync-failure copy — the misleading message can come back');
    const blip = A.syncFailureMessage('offline', 1000);
    assert(/Reconnecting/i.test(blip), 'a momentary network blip should still read as reconnecting');
    // The lie: after twenty minutes of dead auth nothing is reconnecting, and
    // "saved locally" is one cache-clear from gone.
    const dead = A.syncFailureMessage('auth', 20 * 60 * 1000);
    assert(!/Reconnecting/i.test(dead), 'a 20-minute auth failure must stop claiming to reconnect: ' + dead);
    assert(/sign in/i.test(dead), 'the escalated message must name the action that fixes it: ' + dead);
    assert(/expired/i.test(dead), 'the escalated message must say what actually happened: ' + dead);
    // A definitively-dead session escalates immediately — no waiting period.
    assert(!/Reconnecting/i.test(A.syncFailureMessage('auth-expired', 0)),
      'a definitively expired session must escalate at once, not after a timer');
    // …and a brief auth hiccup is still allowed to be a hiccup.
    assert(/Reconnecting/i.test(A.syncFailureMessage('auth', 2000)),
      'a two-second auth wobble must not shout at the player');
  }),

  () => tryRun('b331: the sign-in-expired sheet is actionable, and the b302 eviction gate outranks it', () => {
    const A = window.HearthriseAuth;
    if (!A || typeof A.showAuthExpiredGate !== 'function') { assert(false, 'the expired-session sheet is missing'); }
    try {
      const el = A.showAuthExpiredGate({ streak: 6 });
      assert(el && document.getElementById('hr-auth-expired-gate'), 'the sheet did not render');
      const txt = el.textContent;
      assert(/this device only/i.test(txt), 'it must say where the progress actually is: ' + txt);
      assert(/expired/i.test(txt), 'it must say the sign-in expired');
      assert(el.querySelector('#hr-authexp-signin'), 'it must offer the control that fixes it');
      // Idempotent: six blocked requests must not stack six sheets.
      A.showAuthExpiredGate({});
      assert(document.querySelectorAll('#hr-auth-expired-gate').length === 1, 'the sheet must never stack');
      // Dismissible — a lapsed token must not lock a player out of a running game.
      A.hideAuthExpiredGate();
      assert(!document.getElementById('hr-auth-expired-gate'), 'the sheet must be dismissible');
      // b302 coordination: eviction protects ANOTHER device's save and blocks.
      // This sheet must never draw over it.
      const fake = document.createElement('div');
      fake.id = 'hr-evicted-gate';
      document.body.appendChild(fake);
      try {
        assert(A.showAuthExpiredGate({}) === null, 'the expired sheet must not draw over the eviction gate');
        assert(!document.getElementById('hr-auth-expired-gate'), 'nothing may render behind the eviction gate');
      } finally { fake.remove(); }
    } finally {
      A.hideAuthExpiredGate();
    }
  }),

  /* ── b332 regression suite — THE BROKEN FNV-1a THAT DELETED CONTENT ───────
     `h = (h * 0x01000193) >>> 0` was pasted into five files and documented as
     FNV-1a. It is not. `h * 16777619` is a FLOAT multiply: once the product
     passes 2^53 the low bits — the only ones `>>> 0` keeps — are rounded
     away, so the tail of the key barely reaches the output and the result is
     even 85-100% of the time.

     The consequence is PARITY, not "poor distribution". For any pool indexed
     `hash(key) % pool.length`:
        even-length pool -> exactly half the entries are unreachable, forever
        odd-length pool  -> reachable, but skewed
     Measured on the shipped code over the next 730 days, the world-events
     WEEKLY pool (6 entries) returned ONLY even indices — The King's Bounty,
     War Drums and The Long Harvest had never occurred and never would. The
     same rounding made the DAILY blessing repeat for up to 6 days running,
     because adjacent day keys differ only in the characters the rounding
     discarded.

     The reason this is a GENERIC guard over every pooled selector rather than
     three assertions about blessings: the failure is parity-dependent, so
     adding or removing ONE entry silently flips a pool between "fine" and
     "half the content is dead" with nothing failing either way. src/core/botd.js
     survives today only because its pools happen to be 21 and 7.

     Source-side counterpart: tests/core-purity.mjs `hashIntegrityGuard` bans
     the float-multiply shape anywhere in src/**. */

  /* Every pooled selector in the game, described the same way, so a new one is
     a row rather than a new test. `pick(atMs)` returns the id (or ids) drawn
     for that instant. */
  () => tryRun('b332: every pooled selector reaches EVERY member — no entry is unreachable content', () => {
    const E = window.HearthriseWorldEvents;
    const M = window.HearthriseMuster;
    const C = window.HearthriseCore;
    assert(E && M && C && C.botd, 'a pooled selector module is missing — this guard would silently check nothing');
    const dayKey = (t) => { const d = new Date(t); return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate(); };
    const mons = window.MONSTERS || {};
    const botdPool = (which) => C.botd[which].filter((id) => mons[id]);

    const SELECTORS = [
      { name: 'world-events DAILY (blessing)', members: E.DAILY.map((e) => e.id),
        pick: (t) => E.daily(dayKey(t)).id },
      { name: 'world-events WEEKLY (blessing)', members: E.WEEKLY.map((e) => e.id),
        pick: (t) => E.weekly(E.utcWeekKey(new Date(t))).id },
      { name: 'muster rally (both UTC slots)', members: ['ashen_horde', 'long_harvest', 'forge_levy', 'deep_seam', 'keep_kitchens', 'all_hands'],
        pick: (t) => [M.eventFor(dayKey(t), 1).id, M.eventFor(dayKey(t), 13).id] },
      { name: 'boss of the day', members: botdPool('DAILY_POOL'),
        pick: (t) => C.botd.botdFor(t, mons).dailyId },
      /* b356: the weekly draw is sampled per DAY but keyed per WEEK, so 1461
         days is only ~209 distinct draws — seven identical samples each. The
         0.5 floor is a claim about a large sample and it was already only
         *just* satisfiable at the historical 7-member pool (expected 29.9 per
         member, sd 5.1, so a 3-sigma-low bin lands at ratio 0.49). The pool
         is now 19 (every capstone boss gets a weekly slot): expected 11.0,
         sd 3.2, 3-sigma-low = ratio 0.12. A constant 0.5 would therefore fail
         on legitimate content rather than on skew.
         0.25 is set BELOW that 3-sigma band and far ABOVE the 0.08 the b332
         float-hash bug produced, so this row still catches the failure it
         exists to catch — and `dead.length === 0` above, which is the real
         unreachable-content assertion, is untouched and unweakened. */
      { name: 'boss of the week', members: botdPool('WEEKLY_POOL'), minRatio: 0.25,
        pick: (t) => C.botd.botdFor(t, mons).weeklyId },
      /* The daily-task draw is hash-SEEDED rather than hash-INDEXED (an LCG
         Fisher-Yates runs on top), so its residual skew is the shuffle's, not
         the hash's — hence the looser fairness floor. Under the broken hash it
         measured 0.08; it is 0.37 with the fix. */
      { name: 'daily tasks (top 3 of the pool)', members: (window.DAILY_TASK_POOL || []).map((_, i) => i), minRatio: 0.20,
        pick: (t) => window.dailyTaskIndexes(new Date(t).toDateString()).slice(0, 3) },
    ];

    const DAYS = 1461;                       // four years of real keys
    const T0 = Date.UTC(2024, 0, 1);
    for (const sel of SELECTORS) {
      assert(sel.members.length >= 2, sel.name + ': pool has fewer than 2 members — nothing to distribute');
      const count = new Map(sel.members.map((m) => [m, 0]));
      for (let i = 0; i < DAYS; i++) {
        const drawn = [].concat(sel.pick(T0 + i * 86400000));
        for (const id of drawn) {
          assert(count.has(id), sel.name + ': drew "' + id + '", which is not in the declared pool');
          count.set(id, count.get(id) + 1);
        }
      }
      const dead = sel.members.filter((m) => count.get(m) === 0);
      assert(dead.length === 0,
        sel.name + ': UNREACHABLE CONTENT — ' + dead.join(', ') + ' never occurs in ' + DAYS
        + ' days. Pool length ' + sel.members.length
        + (sel.members.length % 2 === 0 ? ' (EVEN — this is the b332 parity failure)' : ''));
      /* Reachable-but-vanishing is the same bug one pool entry away, so the
         floor is a real assertion and not a formality. */
      const vals = sel.members.map((m) => count.get(m));
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const ratio = Math.min.apply(null, vals) / mean;
      const floor = sel.minRatio || 0.5;
      assert(ratio >= floor,
        sel.name + ': rarest member appears ' + (ratio * 100).toFixed(0) + '% as often as the average'
        + ' (floor ' + (floor * 100) + '%) — the draw is skewed, not uniform: '
        + JSON.stringify(Array.from(count.entries())));
    }
  }),

  () => tryRun('b332: a DAILY rotation actually rotates daily — the float hash made it stick for up to 6 days', () => {
    const E = window.HearthriseWorldEvents;
    const C = window.HearthriseCore;
    const dayKey = (t) => { const d = new Date(t); return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate(); };
    const mons = window.MONSTERS || {};
    const ROTATIONS = [
      { name: 'world-events DAILY', size: E.DAILY.length, at: (t) => E.daily(dayKey(t)).id },
      { name: 'boss of the day', size: C.botd.DAILY_POOL.filter((id) => mons[id]).length, at: (t) => C.botd.botdFor(t, mons).dailyId },
    ];
    const DAYS = 1461, T0 = Date.UTC(2024, 0, 1);
    for (const r of ROTATIONS) {
      let repeats = 0, run = 1, longest = 1, prev = r.at(T0);
      for (let i = 1; i < DAYS; i++) {
        const v = r.at(T0 + i * 86400000);
        if (v === prev) { repeats++; run++; if (run > longest) longest = run; } else run = 1;
        prev = v;
      }
      /* A fair draw repeats about 1/size of the time. Twice that is generous
         and still catches the real thing: the broken hash repeated the daily
         blessing on 36.5% of days against a fair 11%. */
      const rate = repeats / (DAYS - 1);
      const cap = 2 / r.size;
      assert(rate <= cap,
        r.name + ' repeats yesterday on ' + (rate * 100).toFixed(1) + '% of days (fair is ~'
        + (100 / r.size).toFixed(1) + '%, cap ' + (cap * 100).toFixed(1) + '%) — adjacent day keys are colliding, '
        + 'which is what a float multiply in FNV-1a does. Longest identical run: ' + longest + ' days.');
    }
  }),

  () => tryRun('b332: every FNV-1a copy in the game agrees with the reference in src/core/rng.js', () => {
    /* The reference, written out here on purpose: if this test ever has to be
       reconciled with a copy, THIS is the side that is right. */
    const reference = (s) => {
      let h = 0x811c9dc5;
      s = String(s);
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      return h >>> 0;
    };
    const keys = ['', 'a', 'hr-daily-2026-8-12', 'hr-weekly-w2953', 'hr-muster-2026-8-12#13',
                  'hr-boss-2026-8-12', 'hr-weekly-boss-2954', 'the quick brown fox jumps over the lazy dog'];
    const copies = [
      ['world-events._hash', window.HearthriseWorldEvents && window.HearthriseWorldEvents._hash],
      ['core/botd.fnv1a', window.HearthriseCore && window.HearthriseCore.botd && window.HearthriseCore.botd.fnv1a],
      ['core/rng.hashSeed', window.HearthriseCore && window.HearthriseCore.rngMod && window.HearthriseCore.rngMod.hashSeed],
      ['chat-filter._hash', window.ChatFilter && window.ChatFilter._hash],
    ].filter((c) => typeof c[1] === 'function');
    assert(copies.length >= 4, 'an FNV-1a copy is unreachable from the page — this guard is checking less than it claims');
    for (const [name, fn] of copies) {
      for (const k of keys) {
        assert((fn(k) >>> 0) === reference(k),
          name + '("' + k + '") = ' + (fn(k) >>> 0) + ' but FNV-1a is ' + reference(k)
          + ' — a copy has drifted (b332: `h * 0x01000193` is a float multiply; use Math.imul)');
      }
      /* A correct 32-bit FNV-1a is not parity-biased. The broken one returned
         an even value on 85-100% of keys, which is the whole bug in one line. */
      let odd = 0;
      for (let i = 0; i < 2000; i++) if (fn('hr-parity-' + i) & 1) odd++;
      assert(odd > 800 && odd < 1200,
        name + ' is parity-biased: only ' + odd + '/2000 outputs are odd. A float multiply rounds away the low bits, '
        + 'so hash % evenPool can only ever return even indices.');
    }
  }),

  () => tryRun('b332: the muster the client shows is the muster the SERVER pays out', () => {
    /* supabase/migrations/2026-08-09-rally-v2.sql `hr_fnv1a` does the multiply
       in postgres bigint — exact, i.e. it always implemented the CORRECT
       FNV-1a. So while the client hashed in floats the two draws disagreed on
       1230 of 1460 measured day/slot pairs, and the chest the server filled
       was for a different rally than the card the player joined. This asserts
       they now agree; the SQL is reproduced with BigInt, which is what
       postgres arithmetic actually does. */
    const M = window.HearthriseMuster;
    const sqlHash = (s) => {
      let h = 2166136261n;
      for (let i = 0; i < s.length; i++) { h ^= BigInt(s.charCodeAt(i)); h = (h * 16777619n) % 4294967296n; }
      return Number(h);
    };
    const pool = ['ashen_horde', 'long_harvest', 'forge_levy', 'deep_seam', 'keep_kitchens', 'all_hands'];
    const serverPick = (dayKey, slot) => {
      const a = sqlHash('hr-muster-' + dayKey + '#1') % pool.length;
      if (slot === 1) return pool[a];
      const off = sqlHash('hr-muster-' + dayKey + '#' + slot) % (pool.length - 1);
      return pool[(a + 1 + off) % pool.length];
    };
    const T0 = Date.UTC(2026, 0, 1);
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      const d = new Date(T0 + i * 86400000);
      const dayKey = d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
      for (const slot of [1, 13]) {
        const client = M.eventFor(dayKey, slot).id;
        const server = serverPick(dayKey, slot);
        assert(client === server,
          'client and server disagree on ' + dayKey + ' slot ' + slot + ': client says ' + client
          + ', hr_rally_event_id says ' + server + ' — the chest would be filled for a different rally');
        checked++;
      }
    }
    assert(checked === 800, 'the client/server agreement sweep did not run');
  }),

  /* ── b333 regression suite — THE FIX THAT CANNOT REACH ITS PLAYER ──────────
     b331 fixed the dead-token loop. b331 and b332 are both LIVE. The player it
     was written for — b94fa8c0-3627-426a-9714-69c363f8929c — was still emitting
     ~350 HTTP 401/hour two days later, with a game_saves row stale for 2 days
     and 40 minutes, because receiving a client-side fix requires a page reload
     they were not doing.

     That is not a one-off. For an idle game a tab left open for days is the
     INTENDED way to play, so "the fix ships" and "the fix arrives" are separate
     events with an unbounded gap between them — a structural hole under every
     client fix this project will ever ship. Before b333 there was no
     build-version detection anywhere in the codebase: `location.reload()`
     appeared only behind explicit user actions, and the service worker's
     skipWaiting()/clients.claim() only helps the NEXT navigation.

     src/net/build-watch.js polls the deployed build-info.js and compares. What
     these tests pin, in order of how badly each would hurt if it rotted:
       1. the decision is PURE and the table is exhaustive (nothing else can be
          driven honestly if this is a restatement of the code);
       2. uncertainty NEVER prompts — an unreadable body does nothing at all;
       3. it cannot become a request loop (the irony would be terminal);
       4. a poll genuinely reaches the wire, cache-busted, once;
       5. routine = a dismissible card that does not interrupt play;
       6. auth-dead + stale = escalation INTO the b331 sheet, not a rival modal;
       7. NOTHING reloads without a click. */

  () => tryRun('b333: the running-vs-deployed decision table, including "never reload backwards"', () => {
    const W = window.HearthriseBuildWatch;
    assert(W && typeof W.decideBuildUpdate === 'function',
      'build-watch is gone — every future client fix reaches only the players who happen to reload');
    const d = (p) => W.decideBuildUpdate({ running: 332, deployed: 333, authDead: false, ...p });

    // Nothing to say.
    assert(d({ deployed: 332 }).action === 'none', 'the current build must not prompt');
    assert(d({ running: 0 }).action === 'none', 'an unknown running build must not prompt');
    assert(d({ deployed: 0 }).action === 'none', 'an unreadable deployed build must not prompt');
    assert(d({ deployed: NaN }).action === 'none', 'a NaN deployed build must not prompt');
    // A stale CDN edge or a rollback serves an OLDER build-info than the one
    // this tab is running. Asking a player to reload backwards would hand them
    // the very bug they already have the fix for.
    assert(d({ deployed: 331 }).action === 'none',
      'a deployed build OLDER than the running one must never prompt a reload');

    // Routine.
    const n = d({});
    assert(n.action === 'notify' && n.build === 333, 'a newer build must produce a notify, got ' + n.action);
    assert(d({ promptedFor: 333, cardShowing: true }).action === 'none',
      'a card already on screen must not be re-rendered every poll');
    /* DISMISSED and SHOWN are different facts. Only a dismissal is the
       player's decision; a card that vanished without one (a DOM re-render, a
       theme swap rebuilding the body) means they never saw the message, so it
       goes back up. Without this distinction `promptedFor` masks
       `dismissedFor` entirely and the dismissal latch is untestable dead
       code — which is what a mutation proved about the first cut. */
    assert(d({ promptedFor: 333, cardShowing: false }).action === 'notify',
      'a card that disappeared unacknowledged must be shown again — the player was never told');
    assert(d({ dismissedFor: 333, cardShowing: false }).action === 'none', 'a dismissed build must not nag');
    // (running bumped so the lag stays 1: this is the CARD's latch question,
    // not the auto-reload one, which has its own battery below.)
    assert(d({ running: 333, dismissedFor: 333, deployed: 334 }).action === 'notify',
      'dismissing b333 must not silence b334 — the latch is per build, not forever');

    // Escalation. THE POINT OF THE MODULE: in the b331 auth-dead state a stale
    // build is the difference between "your progress is not saving" and "your
    // progress is saving", so it outranks a dismissal of the routine card —
    // the claim is not the one the player waved away.
    const e = d({ authDead: true });
    assert(e.action === 'escalate', 'a stale build with sync DEAD must escalate, got ' + e.action);
    assert(d({ authDead: true, dismissedFor: 333 }).action === 'escalate',
      'escalation must outrank a dismissal of the quiet card — it is a different, worse claim');
    assert(d({ authDead: true, promptedFor: 333 }).action === 'escalate',
      'having shown the quiet card must not consume the escalation');
    assert(d({ authDead: true, escalatedFor: 333 }).action === 'none',
      'escalation must latch per build so it cannot nag every poll');
    assert(d({ authDead: true, deployed: 332 }).action === 'none',
      'auth-dead on a CURRENT build is b331 business, not b333 — reloading would not help');
  }),

  () => tryRun('b333: an unreadable, truncated or captive-portal response can never trigger a prompt', () => {
    const W = window.HearthriseBuildWatch;
    const p = W.parseDeployedBuild;
    assert(p('export const BUILD = Object.freeze({ version: "0.9.2-beta", cache: 333, });') === 333,
      'the real build-info shape must parse');
    assert(p('cache:   4096 ,') === 4096, 'whitespace around the value must parse');
    [null, undefined, '', 'not javascript at all', '<html>Wi-Fi login required</html>',
     'export const BUILD = Object.freeze({ version', 'cache: 0', 'cache: -3', 'cache: abc',
    ].forEach((body) => {
      assert(p(body) === null, 'an unreadable body must yield null, not a number: ' + JSON.stringify(body));
    });
    // A body far larger than a ~1KB build-info is somebody else's page.
    assert(p('cache: 999\n' + 'x'.repeat(W.MAX_BODY_BYTES)) === null,
      'an oversized body must be refused rather than regex-scanned');
    // And null must be inert all the way through the decision.
    assert(W.decideBuildUpdate({ running: 332, deployed: p('garbage'), authDead: true }).action === 'none',
      'an unreadable poll must do NOTHING — uncertainty never prompts, even with sync dead');
  }),

  () => tryRun('b333: three days of an open tab costs a bounded number of polls, and a hidden tab costs four a day', () => {
    const W = window.HearthriseBuildWatch;
    assert(typeof W.decideBuildPoll === 'function', 'the poll gate is gone — this could become a request loop');
    assert(W.POLL_INTERVAL_MS >= 5 * 60000 && W.POLL_INTERVAL_MS <= 60 * 60000,
      'the poll interval (' + W.POLL_INTERVAL_MS + 'ms) left the free-but-useful band of 5-60 minutes');

    const THREE_DAYS = 3 * 24 * 3600 * 1000;
    const STEP = 60000;                       // the module's own wake-up cadence

    // A. healthy, visible, open for three days.
    let last = 0, polls = 0;
    for (let t = 0; t <= THREE_DAYS; t += STEP) {
      if (!W.decideBuildPoll({ now: t, lastPollAt: last, fails: 0, hidden: false, trigger: 'interval' }).poll) continue;
      polls++; last = t;
    }
    const expected = Math.floor(THREE_DAYS / W.POLL_INTERVAL_MS);
    assert(Math.abs(polls - expected) <= 1,
      'three days of a healthy open tab issued ' + polls + ' polls, expected about ' + expected);

    /* B. hidden the whole time. "Not one request, ever" was this contract
       until 2026-09-22, when one real player's hidden tab — born 2026-08-21,
       nine releases behind — spent NINE days putting a retired residue key on
       the wire every ~60 s, being refused (`forbidden_field`) every time,
       saving nothing, and accounting for ~99% of every refusal the game
       records. It could not heal itself: its eviction gate's only exit is a
       reload, the watcher's only escape hatch is a poll, and a hidden tab
       never polled — so six fresh loads on newer builds did not end it, and it
       kept reclaiming the account's single session from the tab the player was
       actually using. Hidden is therefore SLOW, not never. */
    assert(W.HIDDEN_POLL_INTERVAL_MS >= 60 * 60000 && W.HIDDEN_POLL_INTERVAL_MS <= 24 * 3600000,
      'the hidden cadence (' + W.HIDDEN_POLL_INTERVAL_MS + 'ms) left the band that is both free and a rescue');
    let hiddenLast = 0, hiddenPolls = 0, hiddenPollsFirstWindow = 0;
    for (let t = 0; t <= THREE_DAYS; t += STEP) {
      if (!W.decideBuildPoll({ now: t, lastPollAt: hiddenLast, fails: 0, hidden: true, trigger: 'interval' }).poll) continue;
      hiddenPolls++; hiddenLast = t;
      if (t < W.HIDDEN_POLL_INTERVAL_MS) hiddenPollsFirstWindow++;
    }
    const hiddenExpected = Math.floor(THREE_DAYS / W.HIDDEN_POLL_INTERVAL_MS);
    assert(hiddenPolls === hiddenExpected,
      'three days hidden issued ' + hiddenPolls + ' polls, expected exactly ' + hiddenExpected
      + ' — one per hidden interval, no more and no fewer');
    /* Restating what "background tabs must cost nothing" was actually
       protecting, which the amendment must not spend: over any span shorter
       than its own interval a hidden tab still issues ZERO requests, so 30
       idle tabs and an alt-tab are exactly as free as they were. */
    assert(hiddenPollsFirstWindow === 0,
      'a hidden tab polled ' + hiddenPollsFirstWindow + ' times inside its first interval — background tabs must cost nothing');
    // And the nine-day tab itself, stated as the one case that was red today:
    // seven hours buried is a poll, not 'hidden'.
    assert(W.decideBuildPoll({ hidden: true, trigger: 'interval', lastPollAt: 0, fails: 0, now: 7 * 3600e3 }).poll === true,
      'a hidden tab seven hours stale still refuses to poll — no shipped fix can ever reach it');

    // C. the endpoint is 404ing for three days (a bad deploy). Backoff must
    // make that cheap; without it this is 4,320 requests.
    let fails = 0; last = 0; let failPolls = 0;
    for (let t = 0; t <= THREE_DAYS; t += STEP) {
      if (!W.decideBuildPoll({ now: t, lastPollAt: last, fails, hidden: false, trigger: 'interval' }).poll) continue;
      failPolls++; last = t; fails++;
    }
    assert(failPolls > 0 && failPolls <= 120,
      'three days of a failing endpoint cost ' + failPolls + ' requests — backoff is not holding');

    // D. alt-tabbing cannot be turned into a request loop.
    let flapLast = 0, flapPolls = 0;
    for (let t = 0; t <= 3600000; t += 1000) {
      if (!W.decideBuildPoll({ now: t, lastPollAt: flapLast, fails: 0, hidden: false, trigger: 'visible' }).poll) continue;
      flapPolls++; flapLast = t;
    }
    assert(flapPolls <= 61, 'flapping the tab 3,600 times issued ' + flapPolls + ' polls — the visibility throttle is gone');
    assert(flapPolls >= 30, 'returning to the tab never re-checks — the returning player is the one who is about to act');

    // E. a clock that jumped backwards must not unlock an unbounded burst.
    assert(W.decideBuildPoll({ now: 1000, lastPollAt: 9e12, fails: 0, hidden: false, trigger: 'interval' }).poll === false,
      'a backwards clock jump must not unlock polling');
  }),

  () => tryRun('b333: a poll actually reaches the wire — no-store, once per interval, one URL', () => {
    const W = window.HearthriseBuildWatch;
    const before = W.getState();
    const realFetch = window.fetch;
    const calls = [];
    // Answer with THIS tab's own build so the async half of the poll resolves
    // to "up-to-date" and leaves the live game exactly as it found it.
    window.fetch = (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      return Promise.resolve(new Response('export const BUILD = Object.freeze({ cache: ' + before.running + ', });',
        { status: 200 }));
    };
    try {
      W.__setState({ lastPollAt: 0, inFlight: false, fails: 0 });
      const now = 1e12;
      const v = W.tickBuildWatch('interval', now);
      assert(v.poll === true, 'a due poll did not fire: ' + v.reason);
      assert(calls.length === 1, 'a due poll put ' + calls.length + ' requests on the wire, expected exactly 1');
      assert(/build-info\.js/.test(calls[0].url), 'the poll does not read build-info.js: ' + calls[0].url);
      assert(calls[0].init.cache === 'no-store',
        'the poll must be no-store, or the browser answers it from the very cache we are trying to see past');

      // Not twice in the same interval.
      W.tickBuildWatch('interval', now + 1000);
      assert(calls.length === 1, 'a second poll went out 1s later — the interval gate is gone');

      /* NO PER-POLL CACHE-BUSTER. The service worker (legacy.js b111) treats
         every same-origin `.js` as app shell and caches.put()s each DISTINCT
         url it fetches, so a `?bw=<timestamp>` would deposit a permanent Cache
         Storage entry every 15 minutes, forever. `no-store` above is the right
         instrument and the SW's shell strategy is network-first anyway. Two
         polls half an hour apart must therefore hit the SAME url. */
      W.__setState({ lastPollAt: 0, inFlight: false, fails: 0 });
      W.tickBuildWatch('interval', now + W.POLL_INTERVAL_MS * 2);
      assert(calls.length === 2, 'the second interval poll never fired');
      assert(calls[1].url === calls[0].url,
        'each poll requests a unique URL (' + calls[0].url + ' vs ' + calls[1].url
        + ') — the service worker caches every distinct .js it sees, so this leaks a cache entry per poll forever');

      // Not while another is in flight.
      W.__setState({ lastPollAt: 0, inFlight: true });
      W.tickBuildWatch('interval', now + W.POLL_INTERVAL_MS * 5);
      assert(calls.length === 2, 'a poll was issued while one was already in flight');

      // A rejecting endpoint must be silent: no prompt, no throw, just a count.
      window.fetch = () => Promise.reject(new Error('offline'));
      W.__setState({ lastPollAt: 0, inFlight: false, fails: 0 });
      const off = W.tickBuildWatch('interval', now + W.POLL_INTERVAL_MS * 10);
      assert(off.poll === true, 'the offline probe did not run, so it proves nothing');
      assert(!document.getElementById(W.CARD_ID), 'a failed poll rendered UI — failure must be silent');
    } finally {
      window.fetch = realFetch;
      W.__setState(before);
      W.hideUpdateCard();
    }
  }),

  () => tryRun('b333: a routine new build shows a dismissible card that does not interrupt play, and never nags', () => {
    const W = window.HearthriseBuildWatch;
    const before = W.getState();
    let reloads = 0;
    W.__setReloadHook(() => { reloads++; });
    W.__setAuthDeadProbe(() => false);
    try {
      W.__setState({ running: 332, deployed: 0, promptedFor: 0, dismissedFor: 0, escalatedFor: 0, fails: 3 });
      const v = W.applyBuildInfoText('export const BUILD = Object.freeze({ cache: 333, });', Date.now());
      assert(v.action === 'notify', 'a newer deployed build did not notify: ' + v.action + '/' + v.reason);
      assert(W.getState().fails === 0, 'a successful poll must clear the failure streak');
      const card = document.getElementById(W.CARD_ID);
      assert(card, 'no card rendered — the player is never told a new build exists');
      assert(/b333/.test(card.textContent), 'the card does not name the build that is live');

      // NON-INTERRUPTING is the contract, so assert it the way a player would
      // feel it: the game under the middle of the screen is still clickable.
      const cs = getComputedStyle(card);
      assert(cs.position === 'fixed', 'the card must be fixed chrome, not in the layout flow');
      const r = card.getBoundingClientRect();
      assert(r.width < innerWidth * 0.75 && r.height < innerHeight * 0.5,
        'the card covers ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' — that is a modal, not a notice');
      const mid = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2));
      assert(!card.contains(mid), 'the card is blocking the middle of the screen — play is interrupted');
      assert(!card.querySelector('input,select,textarea'), 'the card must not steal input focus');

      // It must not have reloaded anything on its own.
      assert(reloads === 0, 'the card reloaded the page without a click — that can drop unsaved local state');

      // Idempotent: a poll every 15 minutes must not stack cards.
      W.applyBuildInfoText('cache: 333', Date.now());
      assert(document.querySelectorAll('#' + W.CARD_ID).length === 1, 'the card stacked on the next poll');

      /* A card that vanishes WITHOUT the player acting means they never saw
         it, so the next poll puts it back. This is also what makes the
         dismissal assertion below able to fail: without it, `promptedFor`
         alone would answer "none" and the test would pass whether dismissal
         latched or not. */
      W.hideUpdateCard();
      assert(W.applyBuildInfoText('cache: 333', Date.now()).action === 'notify',
        'a card removed without a dismissal was never re-shown — the player is silently left on the old build');
      assert(document.getElementById(W.CARD_ID), 'the re-notify rendered nothing');

      // "Later" is the player's decision, and it latches for THIS build only.
      document.getElementById(W.CARD_ID).querySelector('[data-act="later"]').click();
      assert(!document.getElementById(W.CARD_ID), 'the card is not dismissible');
      assert(reloads === 0, 'dismissing the card reloaded the page');
      assert(W.applyBuildInfoText('cache: 333', Date.now()).action === 'none',
        'the dismissed build came back on the next poll — this would nag every 15 minutes forever');
      assert(!document.getElementById(W.CARD_ID), 'the dismissed card was rendered again');
      // Keep the lag at 1: this asks about the card's per-build latch.
      W.__setState({ running: 333 });
      assert(W.applyBuildInfoText('cache: 334', Date.now()).action === 'notify',
        'the NEXT build was silenced by a dismissal of the previous one');

      // …and the reload button is the only thing that reloads.
      document.getElementById(W.CARD_ID).querySelector('[data-act="reload"]').click();
      assert(reloads === 1, 'the Reload button did not request a reload (' + reloads + ')');
    } finally {
      W.hideUpdateCard();
      W.__setReloadHook(null);
      W.__setAuthDeadProbe(null);
      W.__setState(before);
    }
  }),

  () => tryRun('b333: with sync DEAD, a stale build escalates INTO the b331 sheet — never a rival modal', () => {
    const W = window.HearthriseBuildWatch;
    const A = window.HearthriseAuth;
    assert(A && typeof A.showAuthExpiredGate === 'function',
      'the b331 sign-in-expired sheet is gone — b333 escalation has nothing to compose with');
    const before = W.getState();
    let reloads = 0;
    W.__setReloadHook(() => { reloads++; });
    W.__setAuthDeadProbe(() => true);            // the b331 terminal state
    try {
      A.hideAuthExpiredGate();
      W.hideUpdateCard();
      W.__setState({ running: 332, deployed: 0, promptedFor: 0, dismissedFor: 333, escalatedFor: 0 });

      // Dismissing the quiet card must NOT have bought silence about this.
      const v = W.applyBuildInfoText('cache: 333', Date.now());
      assert(v.action === 'escalate', 'a stale build with sync dead did not escalate: ' + v.action + '/' + v.reason);

      const sheet = document.getElementById('hr-auth-expired-gate');
      assert(sheet, 'escalation did not surface the b331 sheet');
      assert(!document.getElementById(W.CARD_ID),
        'the quiet card is still up alongside the sheet — two dialogs about one failure');
      const block = sheet.querySelector('#' + W.ESCALATION_ID);
      assert(block, 'the sheet carries no build-staleness block — the player is told to re-sign-in but not to reload');
      const t = block.textContent.toLowerCase();
      // The copy must tell the TRUTH about this state: reloading is what
      // restores saving, and until then the only copy is local. We can NOT
      // promise a save first — in this state the save is what is failing.
      assert(/reload/.test(t), 'the escalation never says to reload');
      assert(/this device only|on this device/.test(t),
        'the escalation does not tell the player their progress is local-only until they reload');
      assert(!/saved to the cloud|progress is safe|we have saved/.test(t),
        'the escalation claims the progress is safely saved — it is not, that is the entire failure');
      assert(reloads === 0, 'escalation reloaded the page on its own — in THIS state that can destroy the only copy');
      assert(document.querySelectorAll('#' + W.ESCALATION_ID).length === 1, 'the escalation block stacked');

      // Latched: it must not re-inject on every poll.
      W.applyBuildInfoText('cache: 333', Date.now());
      assert(document.querySelectorAll('#' + W.ESCALATION_ID).length === 1, 'the escalation re-fired on the next poll');

      // The button is the only path to a reload.
      block.querySelector('#hr-authexp-reload').click();
      assert(reloads === 1, 'the escalation reload button does not work (' + reloads + ')');

      // b302 outranks everything: eviction protects ANOTHER device's save.
      A.hideAuthExpiredGate();
      const fake = document.createElement('div');
      fake.id = 'hr-evicted-gate';
      document.body.appendChild(fake);
      try {
        W.__setState({ escalatedFor: 0 });
        W.applyBuildInfoText('cache: 333', Date.now());
        assert(!document.getElementById('hr-auth-expired-gate'), 'b333 drew a sheet over the b302 eviction gate');
        assert(!document.getElementById(W.CARD_ID), 'b333 drew a card over the b302 eviction gate');
        assert(W.getState().escalatedFor === 0, 'a suppressed escalation must not latch — the player was never told');
      } finally { fake.remove(); }
    } finally {
      A.hideAuthExpiredGate();
      W.hideUpdateCard();
      W.__setReloadHook(null);
      W.__setAuthDeadProbe(null);
      W.__setState(before);
    }
  }),

  () => tryRun('b333: the watcher is armed on a live tab, and it is reading THIS build', () => {
    const W = window.HearthriseBuildWatch;
    const st = W.getState();
    assert(st.running === window.HearthriseBuild.cache,
      'build-watch thinks it is running b' + st.running + ' but this tab is b' + window.HearthriseBuild.cache
      + ' — it would compare against the wrong number forever');
    assert(/\/build-info\.js$/.test(W.BUILD_INFO_URL),
      'the poll URL is not build-info.js: ' + W.BUILD_INFO_URL);
    assert(!/\?v=/.test(W.BUILD_INFO_URL),
      'the poll URL carries the RUNNING build\'s ?v= — it would fetch the version it already has: ' + W.BUILD_INFO_URL);
    // Armed: startBuildWatch() ran at import and set the first-poll watermark.
    assert(st.lastPollAt > 0, 'the watcher was never started — nothing polls, and every client fix waits for a reload');
  }),

  /* ── THE SIX-DAY TAB ──────────────────────────────────────────────────────
     Measured live: one tab sent a residue key the server had since deny-listed
     550-800 times a day for six days, persisting nothing and missing every
     shipped fix. The watcher worked the whole time — it polled, it saw the new
     build, it drew the card, and the player ignored the card; `cardShowing`
     then answers 'already-showing' forever, so notify-only leaves staleness
     unbounded. The class fix: one build behind is still the card, two or more
     reloads itself at the next safe moment, once per cooldown. */
  () => tryRun('b550: a tab two builds behind reloads ITSELF, once, at a safe moment — one build behind still only asks', () => {
    const W = window.HearthriseBuildWatch;
    const before = W.getState();
    let reloads = 0;
    let busy = false;
    W.__setReloadHook(() => { reloads++; });
    W.__setAuthDeadProbe(() => false);
    W.__setBusyProbe(() => busy);
    const T = 1e12;
    try {
      W.__clearAutoReloadStamp();
      assert(W.AUTO_RELOAD_MIN_LAG === 2,
        'the auto-reload threshold moved to ' + W.AUTO_RELOAD_MIN_LAG + ' — one build behind must still be a gentle card');

      const d = (p) => W.decideBuildUpdate({
        running: 546, deployed: 548, authDead: false, busy: false,
        now: T, lastAutoReloadAt: 0, ...p,
      });

      // ONE behind: the card, never a yank. An idle player keeps playing.
      assert(d({ deployed: 547 }).action === 'notify',
        'one build behind auto-reloaded — play must never be taken away over a routine release');

      // TWO behind: the tab moves itself. This is the six-day tab.
      assert(d({}).action === 'reload',
        'a tab TWO builds behind only got a card (' + d({}).action + ') — that is exactly the tab that ignored the card for six days');
      assert(d({ deployed: 552 }).action === 'reload', 'six builds behind must also reload');

      // …but never mid-modal, never over a write in flight, and never twice
      // inside the cooldown. Each of those falls back to the CARD, not to
      // silence, so the next poll can still act.
      assert(d({ busy: true }).action === 'notify',
        'the tab reloaded while a modal was open or a write was in flight — that costs the player the action');
      assert(d({ lastAutoReloadAt: T - 1000 }).action === 'notify',
        'a second auto-reload fired inside the cooldown — a CDN edge still serving the old bundle would spin this tab forever');
      assert(d({ lastAutoReloadAt: T - (W.AUTO_RELOAD_COOLDOWN_MS + 1000) }).action === 'reload',
        'the cooldown never expires — a tab that failed to update once could never be rescued again');
      // Auth-dead: its premise (local is the only copy) still holds — escalate.
      assert(d({ authDead: true }).action === 'escalate',
        'an auth-dead tab auto-reloaded — in THAT state the local copy is the only copy');
    } finally {
      W.__setReloadHook(null);
      W.__setAuthDeadProbe(null);
      W.__setBusyProbe(null);
      W.__clearAutoReloadStamp();
      W.__setState(before);
    }
  }),

  /* HIDDEN OUTRANKS BUSY. `busy` asks "would this take an action away from the
     player right now?", and on a tab nobody is looking at the answer is no,
     whatever is on screen underneath. That is the whole rescue: the nine-day
     tab's blocker WAS a modal — the eviction gate, whose only exit is a reload
     — so a busy probe that counts it defers forever. Safe because the reload
     path flushes the residue with the same pagehide keepalive save first. */
  () => tryRun('a hidden tab two builds behind reloads itself — there is no action left for a modal to cost', () => {
    const W = window.HearthriseBuildWatch;
    const T = 1e12;
    const d = (p) => W.decideBuildUpdate({
      running: 546, deployed: 548, authDead: false, busy: false, now: T, lastAutoReloadAt: 0, ...p,
    });
    assert(d({ busy: true, hidden: true }).action === 'reload',
      'a hidden tab two builds behind deferred to a modal nobody is looking at — that is the nine-day tab');
    assert(d({ deployed: 547, hidden: true }).action === 'notify',
      'hidden lowered the two-build threshold — one build behind is still only a card, looked at or not');
    assert(d({ hidden: true, lastAutoReloadAt: T - 1000 }).action === 'notify',
      'hidden spent the cooldown — a CDN edge still serving the old bundle would spin a buried tab forever');
  }),

  () => tryRun('the stale tab moves itself: the live poll path reloads once, stamps its cooldown, and defers around a busy moment', () => {
    const W = window.HearthriseBuildWatch;
    const before = W.getState();
    let reloads = 0;
    let busy = false;
    W.__setReloadHook(() => { reloads++; });
    W.__setAuthDeadProbe(() => false);
    W.__setBusyProbe(() => busy);
    const T = 1e12;
    try {
      W.__clearAutoReloadStamp();
      /* The REAL path, end to end: the module reloads itself exactly once,
         stamps the cooldown so the reload it just asked for cannot be asked
         for again, and puts no card up. */
      W.hideUpdateCard();
      W.__setState({ running: 546, deployed: 0, promptedFor: 0, dismissedFor: 0, escalatedFor: 0, lastAutoReloadAt: 0 });
      const v = W.applyBuildInfoText('export const BUILD = Object.freeze({ cache: 549, });', T);
      assert(v.action === 'reload', 'the live poll path did not auto-reload a 3-build-behind tab: ' + v.action + '/' + v.reason);
      assert(reloads === 1, 'the auto-reload did not reach the reload seam (' + reloads + ')');
      assert(!document.getElementById(W.CARD_ID), 'the auto-reload left a card behind on a page that is navigating away');
      assert(W.getState().lastAutoReloadAt === T, 'the auto-reload did not stamp its cooldown — the loop guard is not armed');

      // The next poll, same page, must NOT reload again.
      W.applyBuildInfoText('cache: 549', T + 60000);
      assert(reloads === 1, 'a second auto-reload fired ' + reloads + ' times on the same page — this is a reload loop');

      // The stamp must survive the reload itself, or the guard is decorative.
      assert(Number(sessionStorage.getItem(W.AUTO_RELOAD_KEY)) === T,
        'the cooldown is not in sessionStorage — it would be forgotten by the very reload it guards');

      // Busy at the moment of the poll: the card, and the reload happens on the
      // next poll once the moment is safe.
      W.__clearAutoReloadStamp();
      W.__setState({ running: 546, promptedFor: 0, dismissedFor: 0, lastAutoReloadAt: 0 });
      busy = true;
      const deferred = W.applyBuildInfoText('cache: 549', T + 120000);
      assert(deferred.action === 'notify', 'a busy tab was not told at all: ' + deferred.action);
      assert(reloads === 1, 'the tab was yanked out from under an open modal');
      busy = false;
      W.hideUpdateCard();
      W.__setState({ promptedFor: 0 });
      const later = W.applyBuildInfoText('cache: 549', T + 180000);
      assert(later.action === 'reload' && reloads === 2,
        'a deferred auto-reload never happened once the moment was safe (' + later.action + '/' + reloads + ')');
    } finally {
      W.__setReloadHook(null);
      W.__setAuthDeadProbe(null);
      W.__setBusyProbe(null);
      W.__clearAutoReloadStamp();
      W.hideUpdateCard();
      W.__setState(before);
    }
  }),

  /* ── b334 regression suite — "COMBAT STYLE CAN'T BE CHOSEN WHILE IN COMBAT" ─
     Player report on b333, which is confusing at first sight because b329 had
     just shipped "switching style mid-fight takes effect immediately" and there
     is no in-combat guard anywhere on the click path. Reproduced, and it was
     THREE independent defects that all present as the same sentence:

       (1) MOBILE, 100%.  combat-hud.css hid `.combat-style-block` for the whole
           of `body.in-combat`, including on the phone's dedicated STYLE
           sub-tab. Tapping Style during a fight showed an empty screen. Every
           phone, every fight, every time.
       (2) MOBILE, 100% (and it would have survived (1)'s fix).  The sub-tab
           sync re-asserted 'arena' on a 1500ms poll, so a player who tapped
           Style mid-fight was dragged back within 1.5 seconds.
       (3) DESKTOP, 7.5% of presses.  renderStyleSelector removed and rebuilt
           the whole picker, and it is hooked onto renderCombat — ~1.3 rebuilds
           a second during a fight. A button torn out between mousedown and
           mouseup produces NO click event at all, so the press did nothing.
           Measured with a real mouse in headless Chromium on b333: 3 of 40.

     (3) is the one a test can most easily pretend to cover, because a synthetic
     `.click()` on a live node always works. The property that actually matters
     is NODE SURVIVAL — the browser only dispatches the click if the element the
     player pressed is still in the document when they release. So that is what
     is asserted, by identity, across a real repaint. */

  () => tryRun('b334: the style buttons SURVIVE a combat repaint (a torn-out button eats the click entirely)', () => {
    const G = window.G;
    const snap = snapshotG();
    try {
      assert(typeof window.renderStyleSelector === 'function',
        'renderStyleSelector must be published — the picker cannot be driven or tested otherwise');
      window.showTab('combat');
      G.equipment = Object.assign({}, G.equipment, { weapon: 'bronze_sword' });
      window.startCombat('goblin');
      assert(G.activeMonster, 'the test needs a live fight');
      window.renderStyleSelector();

      const block = document.querySelector('.combat-style-block');
      assert(block, 'no .combat-style-block rendered during a live fight');
      const btns = [...block.querySelectorAll('.csb-btn')];
      assert(btns.length >= 2, 'the picker needs at least two styles to switch between, got ' + btns.length);

      // THE PROPERTY: the exact element the player pressed is still the exact
      // element in the document after the fight repaints. Five repaints, because
      // the live bug needed only one to land between press and release.
      const pressed = btns[0];
      for (let i = 0; i < 5; i++) {
        window.renderCombat();
        window.renderStyleSelector();          // what the renderCombat hook defers by a tick
      }
      assert(pressed.isConnected,
        'the button the player pressed was removed from the document by a combat repaint — '
        + 'the browser dispatches NO click for a press that ends on a detached node');
      assert(document.querySelector('.csb-btn[data-style-key="' + pressed.getAttribute('data-style-key') + '"]') === pressed,
        'the picker was rebuilt: the button with this style key is a DIFFERENT node than the one before the repaint');
      assert(document.querySelectorAll('.combat-style-block').length === 1,
        'repainting duplicated the style block (' + document.querySelectorAll('.combat-style-block').length + ' present)');

      // …and a press that lands on that surviving node still does the job.
      const t = window.getWeaponType();
      const target = btns.find((b) => b.getAttribute('data-style-key') !== G.combatStyle[t]);
      assert(target, 'every button is already the active style — the test would assert nothing');
      const want = target.getAttribute('data-style-key');
      target.click();
      assert(G.combatStyle[t] === want,
        'clicking a style button after a repaint did not change the style (still ' + G.combatStyle[t] + ')');
    } finally {
      try { window.stopCombat(); } catch (e) {}
      restoreG(snap);
      try { window.renderStyleSelector(); } catch (e) {}
    }
  }),

  () => tryRun('b334: one delegated listener owns the picker, so a REBUILT button still works — and still retimes the fight (b329)', () => {
    const G = window.G;
    const snap = snapshotG();
    const realRetime = window.retimeCombat;
    let retimes = 0;
    try {
      window.showTab('combat');
      G.equipment = Object.assign({}, G.equipment, { weapon: 'bronze_sword' });
      stampRecordLikeLoad(G);   // b456: the worn weapon reaches the picker via equipmentMap
      window.startCombat('goblin');
      window.renderStyleSelector();

      // Force a genuine REBUILD (not an in-place update) by changing the weapon
      // family — the shape key changes, so the whole block is recreated. Before
      // b334 each rebuild re-attached per-button listeners; now nothing does,
      // which is exactly the thing that must not silently stop working.
      G.equipment.weapon = 'shortbow';
      stampRecordLikeLoad(G);
      window.renderStyleSelector();
      assert(window.getWeaponType() === 'ranged', 'the test needs a bow equipped');
      const fresh = document.querySelector('.csb-btn[data-style-key="longrange"]');
      assert(fresh, 'the rebuilt picker has no Longrange button');

      window.retimeCombat = function () { retimes++; return realRetime.apply(this, arguments); };
      G.combatStyle.ranged = 'rapid';
      const fastMs = window.combatTickMs();
      fresh.click();

      assert(G.combatStyle.ranged === 'longrange',
        'a button created by a rebuild does not respond to clicks — the delegated listener is not bound');
      assert(retimes >= 1,
        'picking a style mid-fight did not call retimeCombat() — b329 regressed: the choice would wait for the next target');
      assert(window.combatTickMs() > fastMs,
        'the running fight kept the old swing interval after the style changed ('
        + fastMs + 'ms -> ' + window.combatTickMs() + 'ms)');

      // The public writer is a real seam, not an inline closure, and it refuses
      // a style that does not belong to the equipped weapon family.
      assert(typeof window.applyCombatStyle === 'function', 'window.applyCombatStyle seam missing');
      assert(window.applyCombatStyle('not_a_style') === false && G.combatStyle.ranged === 'longrange',
        'an unknown style key was accepted — the picker would happily write junk into the save');
    } finally {
      window.retimeCombat = realRetime;
      try { window.stopCombat(); } catch (e) {}
      restoreG(snap);
      try { window.renderStyleSelector(); } catch (e) {}
    }
  }),

  () => tryRun('COMBAT-RETIME-1 (b462): the running swing interval follows combatTickMs() on every tick, not only on a style switch', () => {
    /* Beta morning (Tyler): "damage is being taken from the rat before my swing
       timer completes." The swing BAR reads combatTickMs() live; the INTERVAL was
       armed once and re-armed only by the style picker — so a weapon swap, or the
       equipment record hydrating after a resumed fight, left the two clocks apart.
       combatTick() now re-arms itself when the number moved (the skill loop's
       retimeActivity discipline). The invariant: after any tick, the armed
       interval equals the live swing speed. */
    const G = window.G;
    const snap = snapshotG();
    try {
      assert(typeof window.__combatIntervalMs === 'function', '__combatIntervalMs seam missing');
      G.equipment = G.equipment || {};
      G.equipment.weapon = null;
      stampRecordLikeLoad(G);
      window.startCombat('rat');
      const armed0 = window.__combatIntervalMs();
      assert(armed0 === window.combatTickMs(), 'fixture: the interval is armed to the live speed at start');
      // The speed changes UNDER the running fight (a swap; under arm, a record arriving).
      G.equipment.weapon = 'shortbow';
      stampRecordLikeLoad(G);
      const live = window.combatTickMs();
      assert(live !== armed0, 'fixture: equipping a bow must change the swing speed (' + armed0 + ' vs ' + live + ')');
      window.combatTick();
      assert(window.__combatIntervalMs() === live,
        'THE BUG: after a tick the armed interval (' + window.__combatIntervalMs() + 'ms) must equal the live swing speed (' + live + 'ms)');
    } finally {
      try { window.stopCombat(); } catch (e) {}
      restoreG(snap);
    }
  }),

  () => tryRun('b334: on a PHONE mid-fight, the style picker and the stage are BOTH laid out', () => {
    /* Measured at a real phone geometry, because this defect is 100% CSS and
       invisible at the desktop width the rest of the suite runs at. Same iframe
       technique as the b310 inventory probe: media queries inside an iframe
       evaluate against the IFRAME's viewport, so 922x423 reproduces the device.

       WHAT CHANGED IN b362, AND WHY THIS TEST GOT STRONGER.
       The original bug was a PAIR of hides keyed on `data-mobile-sub`: the
       arena was hidden on the Style sub-tab and the style picker was hidden on
       every other one. Either rule alone is defensible; together they made
       "combat style can't be chosen while in combat" (b334) and "click fight
       and the screen is blank" (b230) reachable from a 423px-tall phone.
       The two-screen split deletes the mechanism instead of re-tuning it — the
       Fight screen has no sub-tabs — so the assertion is no longer "the right
       thing is visible on the right tab" but the stronger property that made
       the tab irrelevant: MID-FIGHT, ON A PHONE, THE STAGE AND THE STYLE PICKER
       ARE BOTH LAID OUT, WHATEVER `data-mobile-sub` SAYS.
       MUTATION PROVEN: restore either `:not([data-mobile-sub="style"])` hide in
       combat-hud.css §7 and one of the three sub-tab passes below goes to
       display:none. */
    let css = '';
    let sheetsSeen = 0;
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      const href = sheet.href || '';
      if (href && !/(legacy|audit-overrides|theme-cozy|art-direction|combat-hud|combat-screens)\.css/.test(href)) continue;
      if (href) sheetsSeen++;
      for (const r of rules) css += r.cssText + '\n';
    }
    assert(sheetsSeen >= 6, 'the probe must find all six combat stylesheets, saw ' + sheetsSeen);
    assert(css.length > 100000, 'the CSS blob looks empty (' + css.length + ' chars) — the probe would pass vacuously');

    /* The real structure the module builds: two views under the panel, the
       arena card inside the Fight view, the one style block adopted onto the
       stage. A probe that models the OLD markup would pass forever. */
    const panelInner =
      '<div id="cmb-mob-tabs" class="cmb-mob-tabs"><button class="cmt-btn" data-sub="style">Style</button></div>'
      + '<div class="cbt-views">'
      + '<section class="wt-view"><div class="combat-picker"><div class="monster-row">Goblin</div></div>'
      + '<div class="wt-grid"><button class="wt-card"><span class="wtc-name">Goblin</span></button></div></section>'
      + '<section class="fs-view"><div class="fs-top"><button class="fs-back">Back</button></div>'
      + '<div id="fs-stage-host" class="fs-stage-host"><div class="card combat-arena">'
      + '<div class="arena-vs fs-stage"><div class="arena-side player">'
      + '<div class="arena-portrait"></div>'
      + '<div class="arena-hp-bar"><i></i><span class="arena-hp-text">10 / 10</span></div>'
      + '<div id="fs-style" class="fs-style"><div class="combat-style-block"><h4>Combat Style</h4>'
      + '<div class="csb-meta">m</div><div class="combat-style-buttons">'
      + '<button class="csb-btn" data-style-key="accurate">Accurate<small>'
      + '<span class="csb-trains">attack</span></small></button></div></div></div>'
      + '</div><div class="arena-side foe"><div class="arena-portrait"></div></div>'
      + '<div class="fs-actionbar"><div class="arena-act" id="arena-act-player"></div>'
      + '<button class="btn fs-stop">Stop</button></div></div>'
      + '<div class="fs-logrow"><div id="combat-area"><div class="combat-log">log</div></div></div>'
      + '</div></div></section></div>';

    const frame = document.createElement('iframe');
    frame.setAttribute('style', 'position:fixed;left:-4000px;top:0;width:922px;height:423px;border:0;visibility:hidden');
    document.body.appendChild(frame);
    let out;
    try {
      const doc = frame.contentDocument;
      doc.open();
      /* THE SHELL'S HEIGHT IS PART OF THE FIXTURE. The Fight view is a flex
         column inside a flex column inside the app grid, and every one of them
         is `min-height: 0` — correct in the real shell, where #app is 100vh,
         and a guaranteed zero-height collapse in a bare iframe. Without these
         four rules the probe measures an unlaid-out panel and reports the
         style buttons as "unclickable" no matter what the sheets say. */
      doc.write('<!doctype html><html><head><meta charset="utf-8"><style>' + css
        + 'html,body{margin:0;height:100%}#app{height:100%}.main{height:100%}</style></head>'
        + '<body class="in-combat" data-theme="hearthlight"><div id="app" class="app"><main class="main">'
        + '<section class="panel active" id="panel-combat" data-combat-view="fight" data-fight-state="live" '
        + 'data-mobile-sub="style">' + panelInner + '</section>'
        + '</main></div></body></html>');
      doc.close();
      const win = frame.contentWindow;
      const panel = doc.getElementById('panel-combat');
      const disp = (sel) => { const el = doc.querySelector(sel); return el ? win.getComputedStyle(el).display : 'MISSING'; };
      const seen = (sel) => { const el = doc.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

      out = { vpW: win.innerWidth, vpH: win.innerHeight };
      assert(win.innerWidth <= 1024 && win.innerHeight <= 540,
        'the probe viewport (' + win.innerWidth + 'x' + win.innerHeight + ') is not a phone — the mobile rules would not apply');

      /* THE REPORT, in its strong form: every legacy sub-tab value, mid-fight,
         and the answer must not change — because the sub-tab no longer governs
         anything on this panel. */
      ['style', 'arena', 'monsters'].forEach((sub) => {
        panel.setAttribute('data-mobile-sub', sub);
        assert(disp('.combat-style-block') !== 'none',
          'mid-fight with data-mobile-sub="' + sub + '" the style picker computes display:none — this IS the player report');
        assert(seen('.csb-btn') === true,
          'the style buttons render at zero size with data-mobile-sub="' + sub + '" — unclickable');
        assert(disp('.combat-arena') !== 'none',
          'the stage is hidden mid-fight with data-mobile-sub="' + sub + '" — that is the b230 blank screen');
        assert(seen('.fs-stop') === true,
          'the Stop control is not laid out with data-mobile-sub="' + sub + '" — a fight with no visible exit');
      });
      out.styleTabBlock = disp('.combat-style-block');
      /* b230's other half is intact: a live fight is not a browsing screen. */
      assert(disp('.combat-picker') === 'none',
        'the monster picker must stay hidden during a live fight (b230)');
    } finally {
      frame.remove();
    }
  }),

  () => tryRun('b334: tapping a combat sub-tab mid-fight is not undone by the 1500ms sync poll', () => {
    const panel = document.getElementById('panel-combat');
    assert(panel, 'panel-combat must exist');
    assert(typeof window.__cmbSyncCombatSub === 'function', 'combat sub-tab sync seam missing');
    const styleTab = panel.querySelector('#cmb-mob-tabs .cmt-btn[data-sub="style"]');
    assert(styleTab, 'the mobile Style sub-tab button is gone — there is no way to reach the picker on a phone');

    const hadInCombat = document.body.classList.contains('in-combat');
    const priorSub = panel.dataset.mobileSub;
    try {
      // Fight starts: the sync correctly puts the player on the arena (b230).
      document.body.classList.remove('in-combat');
      window.__cmbSyncCombatSub(panel);
      panel.dataset.mobileSub = 'monsters';
      document.body.classList.add('in-combat');
      window.__cmbSyncCombatSub(panel);
      assert(panel.dataset.mobileSub === 'arena', 'fight start must still open the arena (b230)');

      // The player taps Style. THREE poll ticks then go by.
      styleTab.click();
      assert(panel.dataset.mobileSub === 'style', 'tapping Style did not switch the sub-tab');
      window.__cmbSyncCombatSub(panel);
      window.__cmbSyncCombatSub(panel);
      window.__cmbSyncCombatSub(panel);
      assert(panel.dataset.mobileSub === 'style',
        'the poll dragged the player back to ' + panel.dataset.mobileSub
        + ' — they get at most 1.5s to pick a style, which reads as "you cannot"');

      // The NEXT fight still opens on the arena: the override is per fight, not
      // a permanent surrender of the auto-steer.
      document.body.classList.remove('in-combat');
      window.__cmbSyncCombatSub(panel);
      panel.dataset.mobileSub = 'monsters';
      document.body.classList.add('in-combat');
      window.__cmbSyncCombatSub(panel);
      assert(panel.dataset.mobileSub === 'arena',
        'the manual override leaked into the next fight — every later fight would open on the wrong tab');
    } finally {
      document.body.classList.toggle('in-combat', hadInCombat);
      window.__cmbSyncCombatSub(panel);
      if (priorSub) panel.dataset.mobileSub = priorSub;
    }
  }),

  /* ── b334 regression suite — THE CANCEL THAT WENT NOWHERE ──────────────────
     SYMPTOM (live, b333): `[error-boundary] wrapped render functions ×0`
     printed ~5 times a second for the lifetime of the page, burying every
     other console message.

     ROOT CAUSE, in src/core-ready.js release(). The gate parks every timer a
     classic script registers during the boot window and, on release, restarts
     each one under a REAL platform id while the caller still holds the parking
     id — `remap` is the table that translates between them, and the wrapped
     clearTimeout/clearInterval are the only things that consult it. release()
     ran, in order:

         parked.clear();
         uninstall();          // -> maybeUnwrapClears()
         entries.forEach(...)  // <- remap filled HERE

     and `maybeUnwrapClears()` unwraps when `ready && !parked.size &&
     !remap.size`. At that exact statement all three held: ready, parked
     drained, remap not yet filled. So the platform clear* were restored ONE
     STATEMENT before the table they exist to read was populated. Every
     boot-registered interval was then uncancellable for the rest of the page:
     the caller's clearInterval(parkingId) reached the platform, where that id
     named a parking timeout release() had already cleared — a silent no-op.

     Only the intervals that self-cancel were affected, which is why this hid
     for eleven builds: beta-banner, nav-consolidation, settings-page and
     post-signup-welcome all leak quietly. src/error-boundary.js was the one
     that LOGGED on cancel, so it was the only visible sufferer — and its own
     message was misreported by design (it printed the PER-TICK delta of
     wrap(), which is 0 on every tick after the first because wrap() refuses an
     already-__hrWrapped function), so the number that would have exposed a
     runaway loop was structurally incapable of being anything but 0.

     Node-side proof of the mechanism, run against the real file: park one
     interval, release, self-cancel on the first fire. Before: 10 fires, 9 of
     them after the cancel. After: 1 fire, 0 after the cancel. */

  () => tryRun('b334: the boot-timer gate keeps clear* wrapped while any boot interval is still remapped', () => {
    const stats = window.__hrCoreGateStats;
    assert(typeof stats === 'function',
      'src/core-ready.js no longer exposes __hrCoreGateStats — the runaway-interval bug becomes unobservable again');
    const s = stats();
    assert(s.ready === true, 'the gate never released — every boot timer is still parked');
    assert(s.parked === 0, 'the gate released but left ' + s.parked + ' timer(s) parked');
    /* Non-vacuity. If nothing is remapped the implication below is trivially
       true and this test asserts nothing at all — which is exactly the failure
       family this suite has been bitten by. Boot-registered intervals that are
       never cancelled (legacy.js registers several at parse time) keep this
       above zero for the life of the page. */
    assert(s.remapped > 0,
      'no boot interval is remapped, so the invariant below is vacuous — either core-ready stopped '
      + 'parking (nothing protects the boot window) or the script order in index.html changed');
    assert(s.clearsWrapped === true,
      'THE b334 BUG: ' + s.remapped + ' boot interval(s) are running under substituted platform ids, but '
      + 'clearTimeout/clearInterval have been restored to the platform — the parking ids their callers hold '
      + 'now name nothing, so every one of them is uncancellable for the lifetime of the page');
    /* The other half of the gate's contract, unchanged by this fix: the
       SCHEDULERS must uninstall, or every timer in the game is parked forever.
       Asked as "is the GATE's own function still on window", not as a string or
       platform-identity test: Sentry's tracing bundle re-wraps setTimeout and
       setInterval in its setupOnce, AFTER the gate uninstalls, and copies
       toString() — so window.setTimeout reports "[native code]" while being
       Sentry's wrapper. A string test cannot tell that apart from a gate that
       never uninstalled, and identity against the platform function is false
       here for a perfectly healthy page. */
    assert(s.schedulersParked === false,
      'the gate still owns setTimeout/setInterval — every timer in the game is being parked');
  }),

  () => tryRun('b334: the error boundary sets itself up ONCE — its interval is genuinely dead, not merely told to stop', () => {
    const EB = window.HearthriseErrorBoundary;
    assert(EB && EB.stats, 'the error boundary is not installed — nothing catches a throwing renderer');
    const st = EB.stats;
    assert(st.ticks > 0,
      'the setup interval never fired at all — it was parked and never released, and NOTHING is wrapped');
    /* THE ASSERTION THAT FAILS ON THE LIVE BUG. The suite runs several seconds
       after load, so a 200ms interval that outlived its clearInterval has ticked
       dozens of times by now. `ticksAfterStop` counts fires that happened after
       the boundary called clearInterval on itself: the direct witness that the
       cancel took effect, independent of any bookkeeping the boundary does. */
    assert(st.ticksAfterStop === 0,
      'THE b334 SYMPTOM: the setup interval fired ' + st.ticksAfterStop + ' more time(s) AFTER '
      + 'clearInterval() — the cancel did not take. On the live page this is ~5 console lines a second, forever');
    assert(st.logs === 1,
      'the boundary logged its summary ' + st.logs + ' times; exactly one line per page load is the contract');
    /* And it must not have needed 30 attempts: that would mean the render
       functions arrived late and half the game went unprotected meanwhile. */
    assert(st.ticks <= 5,
      'the boundary needed ' + st.ticks + ' passes to find its targets — the engine is defining its '
      + 'renderers late and the UI is unprotected until it does');
  }),

  () => tryRun('b334: every name in the boundary TARGETS list exists and is actually wrapped — the count cannot lie', () => {
    const EB = window.HearthriseErrorBoundary;
    assert(EB && EB.stats && Array.isArray(EB.TARGETS), 'the error boundary is not installed');
    const st = EB.stats, T = EB.TARGETS;
    assert(T.length >= 10, 'the TARGETS list has shrunk to ' + T.length + ' — most of the UI is unprotected');
    /* The b333 list carried three names that have NEVER been globals in this
       codebase — `render`, `renderSkills`, `switchTab`. It printed "×11" of 14
       and nobody read the shortfall as "three of my targets do not exist",
       because the line reported neither the denominator nor the names. A stale
       entry is now a hard failure here and a NOT DEFINED in the log line. */
    const absent = T.filter((n) => typeof window[n] !== 'function');
    assert(absent.length === 0,
      'the boundary is watching ' + absent.length + ' name(s) that do not exist: ' + absent.join(', ')
      + ' — the UI they were meant to protect is unprotected and the printed count silently under-reports');
    assert(st.missing.length === 0, 'the boundary itself recorded missing targets: ' + st.missing.join(', '));
    assert(st.wrapped === T.length,
      'the boundary reported ' + st.wrapped + ' of ' + T.length + ' wrapped — the number it printed is not the truth');

    /* INDEPENDENT WITNESS, and a standing-debt pin. The boundary wraps all 12 at
       setup — and four of them are REPLACED afterwards by the
       `const orig = window.X; window.X = function(){ orig.apply(...) }` hook
       pattern, which does not carry __hrWrapped through (companions.js does it
       to renderProfile, identity.js and legacy.js to renderCharacter, and
       showTab alone is hooked 23 times across the codebase). Those renderers are
       unprotected in production. It cannot be fixed by defining an accessor on
       window instead: a global `function` declaration creates a
       configurable:false property, so showTab/renderCombat/renderProfile cannot
       be redefined as accessors at all — the honest fix is to stop hooking by
       reassignment, which is the standing `wrapShowTab` debt.
       Pinned as an exact set rather than a tolerance: the test fails if the leak
       GROWS (a new renderer silently loses its boundary) and it fails, for the
       right reason, if someone fixes one — delete it from the list then.
       `wrapped-at-setup === 12` above is the claim about the count; this is the
       claim about reality. */
    /* ⚠ b338 CORRECTION, and the mistake is worth more than the fix.
       During the b335 merge this guard reported that renderProfile now KEEPS the
       boundary, and I removed it from the pinned set on the strength of that ONE
       observation. It is not fixed. It is NON-DETERMINISTIC: companions.js
       reassigns renderProfile, and whether that lands before or after the
       boundary's wrapAll() depends on module load order, which varies run to run.
       So the exact-set pin — correct for the other three — turned this test into
       a coin flip, and it then reported a green suite that was 624/625.
       A single passing observation is not evidence a race is fixed; it is one
       sample of a distribution. The guard was right both times and I read it
       wrong the first time.
       renderProfile is therefore pinned as EITHER-STATE with its reason, while
       the other three stay exact. That is deliberately weaker for one entry
       rather than tolerant for all four: a new renderer losing its boundary is
       still caught, and renderProfile stops lying in both directions. The real
       fix is the standing `wrapShowTab` debt — stop hooking by reassignment. */
    /* b405 — showTab REMOVED from this list. It was here because it was hooked by
       reassignment ~23 times and a late reassignment (autoOpenActivity via
       applyAll, etc.) stripped the error boundary off it after wrapAll() ran. The
       showTab tap-registry (src/utils/showtab-registry.js) paid that debt: the
       ~24 sites are now post-taps that never reassign window.showTab, so
       error-boundary's wrap is the LAST thing to touch it and its __hrWrapped
       sticks deterministically. This entry now PINS that fix — if showTab ever
       loses its boundary again, the `unexpected` assertion above fails. */
    /* ⚠ b456 — renderCombat JOINS renderProfile AS RACY, FOR THE SAME REASON AND
       ON THE SAME EVIDENCE. It is reassigned by THREE wrap-by-reassignment sites
       at module-init time — src/features/combat-screens.js (~1483, the
       camera-follows-a-fight wrapper), and two legacy.js IIFEs (~9836, the icon
       repaint; ~10167, the arena active marker) — none of which carries
       `__hrWrapped` through. Whether any of them lands before or after the
       boundary's wrapAll() is module load order, which varies run to run.
       MEASURED: 4/4 fresh boots showed renderCombat WRAPPED with the
       combat-screens wrapper absent, while 3 of 8 full suite runs on the same
       build reported it stripped. That is a distribution, not a regression, and
       pinning it as an exact expectation made this guard a coin flip — the b338
       CORRECTION above is that exact lesson, written the first time it happened.
       The real fix is the standing `wrapShowTab` debt (stop hooking by
       reassignment; combat-screens already did it for showTab via the tap
       registry — do the same for renderCombat). Filed, not silenced: the entry
       carries its reason and the diagnostic below names the wrapper on top. */
    const KNOWN_UNWRAPPED = ['renderCharacter', 'renderSkillDetail'];
    const RACY_UNWRAPPED  = ['renderProfile', 'renderCombat'];
    const lost = T.filter((n) => !(typeof window[n] === 'function' && window[n].__hrWrapped === true));
    const unexpected = lost.filter((n) => KNOWN_UNWRAPPED.indexOf(n) < 0 && RACY_UNWRAPPED.indexOf(n) < 0);
    const whoOwns = (n) => {
      const f = window[n];
      if (typeof f !== 'function') return n + '=absent';
      const tags = ['__hrWrapped', '__hrCombatScreens'].filter((k) => f[k]);
      return n + '=' + (tags.length ? tags.join('+') : 'unknown-wrapper');
    };
    assert(unexpected.length === 0,
      'the error boundary was stripped off ' + unexpected.join(', ') + ' after it ran — something '
      + 'redefined the function without carrying the wrapper through, so a throw there blanks the UI'
      + ' [' + unexpected.map(whoOwns).join(', ') + ']');
    /* Only the EXACT set is checked for "someone fixed it"; a racy entry can be
       wrapped on this run and not the next, so asserting either way on it is the
       coin flip described above. */
    const fixed = KNOWN_UNWRAPPED.filter((n) => lost.indexOf(n) < 0);
    assert(fixed.length === 0,
      fixed.join(', ') + ' now KEEPS the error boundary — good; remove it from KNOWN_UNWRAPPED so the '
      + 'guard keeps pinning the real leak');
    /* THE MECHANISM OF THE MISREPORT, asserted directly: wrap() refuses an
       already-__hrWrapped function, so the PER-TICK delta the b333 line printed
       is 0 for every tick after the first — the number could not have been
       anything else, whatever was happening. Only a cumulative total can be
       true. (wrap(), unlike wrapAll(), has no side effect on a hit.) */
    window.__hrWrapProbe = function () { return 7; };
    try {
      assert(EB.wrap('__hrWrapProbe') === true, 'wrap() refused a fresh function — the boundary wraps nothing');
      assert(window.__hrWrapProbe.__hrWrapped === true, 'wrap() reported success without marking the function');
      assert(window.__hrWrapProbe() === 7, 'the wrapper does not pass the return value through');
      assert(EB.wrap('__hrWrapProbe') === false,
        'wrap() re-wrapped an already-wrapped function — the render path would be double-wrapped, and the '
        + 'b333 per-tick count would have looked meaningful when it could only ever be 0');
    } finally { delete window.__hrWrapProbe; }
  }),

  () => tryRun('b334: window.render is a phantom — nothing may depend on it, refreshAll is the real full repaint', () => {
    /* src/net/auth.js and src/settings-page.js both did
       `if (typeof window.render === 'function') window.render();`
       after an auth state change. The guard is why it was invisible: a guarded
       call to a name that never existed does nothing, forever, silently. */
    assert(typeof window.render !== 'function',
      'window.render now exists — if it is genuinely the full repaint, add it to the boundary TARGETS; '
      + 'if it is a feature-local render() that leaked to the global scope, that is the bug');
    assert(typeof window.refreshAll === 'function',
      'window.refreshAll is gone — the auth and settings full-repaint call sites are dead again');
    assert(window.HearthriseErrorBoundary.TARGETS.indexOf('refreshAll') >= 0,
      'the full repaint is not inside the error boundary — a throw in it blanks the whole UI');
  }),
];
