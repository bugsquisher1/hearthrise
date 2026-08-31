// ============================================================
// src/features/daily-reward.js  — Daily login reward (retention)
//
// The single most proven "keep them coming back" mechanic, built on the
// CLAIM streak the server derives from the character's own daily/login claim
// rows (src/data/rewards.js `deriveLoginStreak`) — NOT on `G.streak`, which is
// the play streak and a different quantity. See the b498 block below.
//
// How it works:
//   • A 7-day escalating cycle (Day 1 small → Day 7 jackpot).
//   • Which day you're on = your current streak position, so a longer streak
//     keeps landing bigger days; each COMPLETED week scales the whole cycle up
//     (+50% per week) so veterans still care.
//   • Claim once per UTC day. Miss a day → streak resets to Day 1 (you lose
//     nothing you had — just the escalation restarts. Loss aversion, the kind
//     that doesn't punish).
//   • Surfaced as a prominent Home card AND a gentle once-per-day popup that
//     waits for any other modal to clear (so it never stacks onto the welcome
//     /beta/rank-up modals — the game already has too many front-door popups).
//
// Classic IIFE (window.HearthriseDaily), loaded after legacy.js. Reads G
// defensively.
// ============================================================
(function () {
  'use strict';

  /* ── THE CYCLE MOVED TO src/data/rewards.js (b349) ────────────────────────
     A grant intent's whole job is "the SERVER decides how much", and that is
     only true if the server can READ the number. This file is a classic
     <script>, so neither Deno nor Node can import it, and the seven-entry cycle
     that used to sit right here was therefore unreachable from the one place
     the economy is about to be decided.

     It is now authored ONCE in src/data/rewards.js (pure ESM), published on
     `window.HearthriseRewards` by src/main.js, and vendored into the Edge
     Function by tools/pack-edge.mjs. There is no second copy and nothing to
     drift — contrast tools/gen-shops.mjs, which DOES emit a second copy plus a
     guard, because its tables are trapped inside src/legacy.js.

     ⚠ AND IT FAILS LOUD RATHER THAN FALLING BACK. An inline fallback cycle here
       would be exactly the second copy this move deletes, and the failure it
       would hide is the worst kind: the sheet keeps paying, from numbers the
       server has never seen, with no error anywhere. A missing module is a
       WIRING BREAK — console.error fails the headless smoke gate — and every
       reader below returns null, so nothing is paid rather than the wrong thing
       being paid. (Same discipline as legacy.js's `src()` / `destOf()` after
       b224, where a silently-missing export made every quest read 0/N forever.) */
  var _rewardsWarned = false;
  function REWARDS() {
    var R = window.HearthriseRewards;
    if (!R || typeof R.priceDailyLogin !== 'function' || !R.DAILY_LOGIN_CYCLE
        || typeof R.deriveLoginStreak !== 'function') {
      if (!_rewardsWarned) {
        _rewardsWarned = true;
        console.error('[DailyReward] window.HearthriseRewards is missing — src/data/rewards.js is '
          + 'the only source of the login cycle, so nothing can be priced or paid');
      }
      return null;
    }
    return R;
  }

  function todayKey() {
    // Must match legacy checkStreak()'s UTC day key exactly.
    var d = new Date();
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  }
  /* Same LOCAL form as todayKey (YYYYMMDD), one UTC day earlier. Deliberately
     NOT the server's `hr_utc_day_key` spelling ('2026-8-31') — these two keys
     only ever compare against `lastClaimDay`, which is this file's own local
     "have I shown the sheet today" cache and has never been authority. The
     server's spelling is used, unmixed, in the capture below. */
  function yesterdayKey() {
    var d = new Date(Date.now() - 86400000);
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  }

  function ensureState(G) {
    G = G || window.G; if (!G) return null;
    if (!G.dailyReward || typeof G.dailyReward !== 'object') G.dailyReward = { lastClaimDay: 0 };
    if (typeof G.dailyReward.lastClaimDay !== 'number') G.dailyReward.lastClaimDay = 0;
    return G.dailyReward;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     THE LOGIN STREAK THIS SHEET DISPLAYS — b475, RE-RULED IN b498.
     ══════════════════════════════════════════════════════════════════════════
     b475 read `state.streak_days` off the envelope and called it the streak.
     That was the WRONG QUANTITY, and it took three weeks to show: there are two
     streaks on the server and only one of them prices a claim.

       state.streak_days   hr_apply §4c (2026-08-21-streak-state.sql). Advanced
                           by any delta carrying `accrued_to` — i.e. by PLAYING.
                           "Consecutive days settled."
       deriveLoginStreak   src/data/rewards.js, and the ONLY input to the
                           payout. "Consecutive days CLAIMED", read off the
                           character's own daily/login claim rows.

     LIVE, 2026-08-31 (b497 play-gate): lastClaimDay was 20260829, Aug 30 went
     unclaimed, and on Aug 31 this sheet advertised "3-DAY STREAK / Claim Day 3 ·
     2,000 gold · 5 gems" while the server correctly paid Day 1 — 500 gold, no
     gems. Nothing was lost and the claim stamped clean, but the modal promised
     4x what it paid, which is the "feels like theft" class. Two ways to reach
     it, both live: play a day without claiming it, or simply open the game
     before the day's first settle has reset the settle streak.

     THE FIX IS NOT A SECOND RULE — IT IS THE SERVER'S OWN RULE, ON THE SERVER'S
     OWN ROWS. `hr_state_of` already projects the `daily`/`login` progress rows
     on every envelope (that is what b465's markServerClaim reads), and
     `deriveLoginStreak` is now authored in src/data/rewards.js, which the
     browser reaches through window.HearthriseRewards and the Edge Function
     vendors. So the sheet and the pricer run THE SAME FUNCTION over THE SAME
     ROWS. There is no copy to drift and no guard needed to hold two copies
     together — the b349 discipline that ended this for the reward LADDER,
     applied to the day.

     Still DISPLAY-only: the claim/payout is unchanged, the server derives its
     own streak from its own rows under a lock, and nothing the client computes
     here is ever sent. */
  /* The capture: the daily/login rows the last envelope carried, plus the
     SERVER's UTC day number at that moment. `null` = no envelope seen yet. */
  var serverClaim = null;
  function noteServerStreak(env) {
    if (env === null) { serverClaim = null; return; }   // test seam: forget the capture
    try {
      if (!env || typeof env !== 'object') return;
      var rows = env.progress;
      /* An envelope with no progress array is a REFUSAL shape, not "no rows" —
         it must never clobber a good capture with an empty one. */
      if (!Array.isArray(rows)) return;
      /* ⚠ AND A TRUNCATED ENVELOPE IS NOT AN ANSWER. hr_state_of's progress read
         is `limit 1000`; the claim path uses hr_claim_lookup, which is bounded
         to three period keys and cannot truncate. So a truncated envelope is
         exactly the case where yesterday's row may be missing WITHOUT the
         streak being broken — the silent under-payment 2026-08-16-claim-reward
         .sql §(a) names. Decline to capture and let the local rule answer. */
      if (env.progress_truncated === true) return;
      var B = window.HearthriseCore && window.HearthriseCore.botd;
      if (!B || typeof B.utcDayNumber !== 'function') return;
      /* THE SERVER'S CLOCK, off the envelope — never Date.now(). A device clock
         running behind would otherwise read a claimed row from two days ago as
         "yesterday" and re-open the exact over-promise this block closes. */
      var ms = Date.parse(env.now);
      if (!Number.isFinite(ms)) return;
      var map = {};
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!r || r.kind !== 'daily' || r.key !== 'login') continue;
        if (typeof r.period !== 'string' || r.period === '') continue;
        map[r.period] = { value: r.value, state: r.state };
      }
      serverClaim = { rows: map, dayN: B.utcDayNumber(ms) };
    } catch (e) { /* a display hint must never break an envelope apply */ }
  }

  /**
   * The streak the SERVER will price a claim at, or `null` when the client
   * cannot know it with certainty (no envelope yet, or the capture does not
   * cover the day being asked about).
   */
  var _botdWarned = false;
  function serverClaimStreak() {
    if (!serverClaim) return null;
    var R = REWARDS(); if (!R) return null;
    var B = window.HearthriseCore && window.HearthriseCore.botd;
    if (!B || typeof B.utcDayKey !== 'function' || typeof B.utcDayNumber !== 'function') {
      /* WE HOLD A CAPTURE AND CANNOT READ THE DAY IT IS FILED UNDER. That is a
         wiring break, not a quiet fallback — the sheet is about to advertise a
         day derived from a guess, which is precisely the b497 failure. Loud
         once (console.error fails the headless gate), never per render.
         Unreachable in practice: noteServerStreak refuses to capture without
         botd, so a capture existing means botd existed a moment ago. */
      if (!_botdWarned) {
        _botdWarned = true;
        console.error('[DailyReward] HearthriseCore.botd.utcDayKey/utcDayNumber is missing — the '
          + 'sheet cannot read the server day its claim rows are filed under, so the advertised '
          + 'day falls back to a local guess');
      }
      return null;
    }
    /* WHICH DAY ARE WE ASKING ABOUT? The one the rest of this file already
       treats as today — `isClaimable` keys on the local UTC day — so a tab left
       open across UTC midnight asks about the new day and gets the new day's
       answer. But the capture only licenses ONE such rollover: outside
       [serverDay, serverDay+1] the rows we hold say nothing about the day in
       question, and inventing an answer from them is how a wrong device clock
       becomes a wrong promise. Act only on certainty (save-invariant #2). */
    var dayN = B.utcDayNumber(Date.now());
    if (dayN < serverClaim.dayN || dayN > serverClaim.dayN + 1) return null;
    /* `utcDayKey` is src/core/botd.js's — the ONE JS spelling of
       `public.hr_utc_day_key`, bound to the SQL by tests/claim-intent.mjs C13d.
       src/data/rewards.js deliberately holds no day-key function; see the block
       at the foot of that file for why a fourth one must never be written. */
    var prev = B.utcDayKey((dayN - 1) * 86400000);
    return R.deriveLoginStreak({ prev: prev, rows: serverClaim.rows });
  }

  /**
   * THE FALLBACK, for the pre-envelope moment (boot before hydration, or a
   * client-authoritative build). It applies THE SAME RESET RULE the server
   * applies, over the only claim history the client holds: `lastClaimDay`.
   *
   *   the last claim was neither today nor yesterday  ⇒  the streak is broken
   *                                                      ⇒ Day 1, which is what
   *                                                        deriveLoginStreak
   *                                                        will return
   *
   * ⚠ `lastClaimDay === 0` IS NOT A GAP — it is the ABSENCE of a claim history
   *   (a fresh character, or a residue that never hydrated), and treating it as
   *   evidence of a broken streak would be acting without certainty in the other
   *   direction. The residue answers there, and on a genuinely fresh character
   *   the residue is 1, which is the correct opening state.
   *
   * The residue (`G.streak.count`) is the PLAY streak, not the claim streak, so
   * it is a guess even when it is used — but it can now only ever UNDER-state
   * the day, never promise one the server will not pay.
   */
  function localStreak(G) {
    var residue = (G && G.streak && typeof G.streak.count === 'number' && G.streak.count > 0)
      ? G.streak.count : 1;
    var s = ensureState(G);
    var last = (s && typeof s.lastClaimDay === 'number') ? s.lastClaimDay : 0;
    if (!last) return residue;
    if (last !== todayKey() && last !== yesterdayKey()) return 1;
    return residue;
  }

  function streakCount(G) {
    var srv = serverClaimStreak();
    if (typeof srv === 'number' && srv >= 1) return srv;
    return localStreak(G || window.G);
  }

  /* Every one of these is now a VIEW of the shared pricing function rather than
     a second arithmetic. `priceDailyLogin` returns cycleDay, weeksDone, mult,
     gold and gems from one place, so the sheet, the claim and the SERVER can no
     longer disagree about which day it is or what it is worth. */
  function priced(G) {
    var R = REWARDS(); if (!R) return null;
    return R.priceDailyLogin(streakCount(G));
  }
  // 1-based day within the current 7-day cycle.
  function cycleDay(G) { var p = priced(G); return p ? p.cycleDay : 0; }
  function weeksDone(G) { var p = priced(G); return p ? p.weeksDone : 0; }

  // The reward waiting today, scaled by completed weeks (+50% each, capped —
  // see DAILY_LOGIN_MAX_WEEK_MULT in src/data/rewards.js for why a cap exists).
  function rewardFor(G) {
    var p = priced(G); if (!p) return null;
    var out = {};
    if (p.gold) out.gold = p.gold;
    if (p.gems) out.gems = p.gems;
    return out;
  }

  function isClaimable(G) {
    G = G || window.G; var s = ensureState(G); if (!s) return false;
    return todayKey() !== s.lastClaimDay;
  }

  function claim(G) {
    G = G || window.G; var s = ensureState(G); if (!s) return null;
    if (!isClaimable(G)) return null;
    var rw = rewardFor(G);
    /* NOTHING IS PAID WHEN NOTHING CAN BE PRICED. `rewardFor` is null exactly
       when src/data/rewards.js did not arrive, and paying an invented number is
       the failure this whole program exists to remove — a client authoring a
       progression value. The state is left untouched too, so the day is still
       claimable once the wiring is fixed. */
    if (!rw) return null;
    rw = Object.assign({}, rw);   // a receipt of our own — never mark the catalogue row
    /* ══════════════════════════════════════════════════════════════════════
       THE DOUBLE-PAY SURFACE — the one Security named before it was written.
       ══════════════════════════════════════════════════════════════════════
       With the kill switch ON this claim goes to the server as
       `claim_reward {kind:'daily', key:'login'}` and the server decides the
       amount from ITS OWN copy of src/data/rewards.js, its own day key and its
       own streak (derived from yesterday's claim row — `G.streak.count` is
       never an input and there is no field through which it could become one).

       The lines below are then a PREDICTION, not a payment:
         · they run through `goldSettle`, which records the amount against this
           gesture's intent key;
         · the server's envelope is applied ABSOLUTELY by src/net/gold.js
           (`G.gold = state.gold`, `G.gems = state.gems`) and RETIRES the
           prediction;
         · `granted` — the receipt — is RENDERED and never added to anything.

       So the money moves exactly once and it is the server's number. There is
       no ordering in which both halves pay: an additive apply does not exist in
       the code. A refusal carrying no envelope rolls the prediction back; an
       unanswered call leaves it standing for the next envelope to settle,
       because guessing either way would be the client authoring a value.

       ⚠ `s.lastClaimDay` REMAINS A LOCAL CACHE — "have I shown the sheet today"
         — and with the switch on it is no longer the eligibility test. The
         server's `not_claimable` is, because it is the only answer that
         survives a second device. It is set BEFORE the call so a double-tap
         cannot open two claims; the server refuses the second anyway, under a
         lock, and that refusal is what actually guarantees it. */
    /* ⚠ GOLD **AND** GEMS THROUGH ONE PREDICTION (F5). The gem half used to be
       a bare `G.gems += rw.gems` sitting next to the seam call, which made it
       the one number in a wired gesture that was paid locally and never
       reconciled — the double-pay this file's header claims to have closed,
       still open one field over. Security's probe: two tabs, same UTC day. The
       server refuses the second claim under a lock and clamps gems at the
       5,000/day ceiling; the client paid both. ONE entry covers both fields so
       they cannot acquire separate lifecycles. */
    var key = window.goldIntentKey();
    window.goldSettleCurrency({ gold: rw.gold || 0, gems: rw.gems || 0 }, 'claim.daily_login', key);
    s.lastClaimDay = todayKey();
    if (key && window.HearthriseGold) {
      var p = window.HearthriseGold.claimReward('daily', 'login', key);
      /* b462 — the verdict is READ, not dropped. A `refused` (not_claimable:
         already claimed today on this or another device) must not leave a
         "Daily reward: 500 gold" toast standing on a payout that never landed —
         that was the visible half of the every-refresh bug. The gold seam has
         already rolled the prediction back; this is the honest sentence. */
      if (p && p.then) p.then(function (v) {
        var o = v && v.outcome;
        if (o === 'refused') {
          s.lastClaimDay = todayKey();
          if (typeof window.notify === 'function') window.notify('Today’s daily reward was already claimed — come back tomorrow.', 'info');
        } else if ((o === 'applied' || o === 'replayed') && typeof window.notify === 'function') {
          window.notify('Daily reward: ' + rewardPlain(rw), 'levelup');
        }
        try { if (window.HearthriseHome && window.HearthriseHome.render) window.HearthriseHome.render(); } catch (e) {}
      }, function () {});
      rw._toastDeferred = true;   // the verdict toasts; the click handler must not
    }
    try { if (typeof window.saveLocal === 'function') window.saveLocal(); } catch (e) {}
    try { if (typeof window.updateTopbar === 'function') window.updateTopbar(); } catch (e) {}
    return rw;
  }

  function fmt(n) { return (n || 0).toLocaleString(); }
  // Gilt glyph from the shared icon set (no emoji — directive). Falls back
  // to the plain word while icon paths are still loading.
  function ico(key, px) {
    var p = window.HearthriseIconSet && window.HearthriseIconSet.path && window.HearthriseIconSet.path(key);
    if (!p) return null;
    return '<svg viewBox="0 0 512 512" style="width:' + (px || 14) + 'px;height:' + (px || 14) + 'px;' +
      'vertical-align:-2px;display:inline-block" aria-hidden="true"><path fill="currentColor" d="' + p + '"/></svg>';
  }
  function amountHtml(key, n, word, px) {
    var g = ico(key, px);
    return g ? (g + ' ' + fmt(n)) : (fmt(n) + ' ' + word);
  }
  function rewardText(rw) {
    var p = [];
    if (rw.gold) p.push(amountHtml('gold', rw.gold, 'gold'));
    if (rw.gems) p.push(amountHtml('gems', rw.gems, 'gems'));
    return p.join('  ');
  }
  /* b219: rewardText() returns MARKUP (inline <svg> glyphs) for the claim
     button. It was also being handed to notify(), which renders with
     textContent — so claiming the daily reward printed ~700 characters of
     raw SVG path data into the corner as a toast. It was always broken;
     the b219 toast (body-size type, length-scaled dwell) just stopped it
     being small and brief enough to miss. Toasts get plain text. */
  function rewardPlain(rw) {
    var p = [];
    if (rw.gold) p.push(fmt(rw.gold) + ' Gold');
    if (rw.gems) p.push(fmt(rw.gems) + ' Gems');
    return p.join(', ');
  }

  function ensureStyle() {
    if (document.getElementById('hr-daily-css')) return;
    var s = document.createElement('style');
    s.id = 'hr-daily-css';
    s.textContent = [
      '.hr-dl-scrim{position:fixed;inset:0;z-index:99997;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:18px}',
      '.hr-dl-box{background:var(--bg-1,#1a1f2e);border:2px solid var(--gold,#e0a64a);border-radius:16px;max-width:420px;width:100%;padding:22px;color:var(--ink,#e9e2cf);text-align:center;box-shadow:0 0 55px -12px color-mix(in srgb,var(--gold,#e0a64a) 50%,transparent);font-family:var(--f-ui,system-ui,sans-serif)}',
      '.hr-dl-eyebrow{font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3,#a5896a)}',
      '.hr-dl-h{font-family:var(--f-display,serif);font-size:calc(25px * var(--ui-scale, 1));font-weight:800;color:var(--gold,#e0a64a);margin:4px 0 12px}',
      '.hr-dl-week{display:flex;gap:6px;justify-content:center;margin:6px 0 16px;flex-wrap:wrap}',
      '.hr-dl-day{flex:1;min-width:38px;max-width:52px;border:1px solid var(--line-soft,rgba(122,94,58,.25));border-radius:9px;padding:7px 3px;font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3,#a5896a);background:var(--bg-0,#0f1320)}',
      '.hr-dl-day.done{opacity:.55}',
      '.hr-dl-day.today{border-color:var(--gold,#e0a64a);background:color-mix(in srgb,var(--gold,#e0a64a) 16%,transparent);color:var(--ink,#e9e2cf)}',
      '.hr-dl-day b{display:block;font-size:calc(16px * var(--ui-scale, 1));color:var(--gold,#e0a64a);margin-top:2px}',
      '.hr-dl-claim{border:none;border-radius:9px;padding:11px 22px;font-weight:800;font-size:calc(16px * var(--ui-scale, 1));cursor:pointer;background:linear-gradient(180deg,var(--gold,#f0b860),var(--gold-2,#d99c40));color:var(--bg-0,#20160a)}',
      '.hr-dl-claim:active{transform:translateY(1px)}',
      /* b345 — THE WAY OUT, MADE VISIBLE. See the block comment on open().
         Tokens only (no hardcoded colour beyond the existing fallbacks this
         file already uses), and it sits INSIDE the box so it is part of the
         panel the player is looking at rather than floating chrome. */
      '.hr-dl-box{position:relative}',
      '.hr-dl-close{position:absolute;top:8px;right:10px;width:30px;height:30px;line-height:1;'
        + 'border:1px solid var(--line-soft,rgba(122,94,58,.35));border-radius:8px;cursor:pointer;'
        + 'background:transparent;color:var(--ink-3,#a5896a);font-size:calc(19px * var(--ui-scale, 1));'
        + 'display:flex;align-items:center;justify-content:center;padding:0}',
      '.hr-dl-close:hover{color:var(--ink,#e9e2cf);border-color:var(--gold,#e0a64a)}',
      '.hr-dl-hint{margin-top:10px;font-size:calc(13px * var(--ui-scale, 1));color:var(--ink-3,#a5896a)}'
    ].join('');
    document.head.appendChild(s);
  }

  function open() {
    if (document.getElementById('hr-dl-modal')) return;
    ensureStyle();
    var G = window.G;
    var R = REWARDS();
    /* No cycle, no sheet. Opening a reward modal that cannot state a number is
       worse than not opening one — REWARDS() has already logged the wiring
       break loudly. */
    if (!R) return;
    var p = R.priceDailyLogin(streakCount(G));
    var day = p.cycleDay, wk = p.weeksDone;
    var claimable = isClaimable(G);
    /* The strip is rendered through the SAME pricing function as the claim, one
       cycle position at a time, so the "D5 = 6k" a player reads and the gold
       they are actually paid cannot come from two different multipliers. */
    var week = R.DAILY_LOGIN_CYCLE.map(function (_r, i) {
      var d = i + 1;
      /* Position d of the CURRENT week: same weeksDone, day d. */
      var q = R.priceDailyLogin(wk * R.DAILY_LOGIN_CYCLE_DAYS + d);
      var val = q.gems
        ? amountHtml('gems', q.gems, 'gems', 10)
        : (q.gold >= 1000
            ? ((ico('gold', 10) || '') + ' ' + Math.round(q.gold / 1000) + 'k').trim()
            : amountHtml('gold', q.gold, 'gold', 10));
      var cls = 'hr-dl-day' + (d < day ? ' done' : d === day ? ' today' : '');
      return '<div class="' + cls + '">D' + d + '<b>' + val + '</b></div>';
    }).join('');
    var scrim = document.createElement('div');
    scrim.className = 'hr-dl-scrim'; scrim.id = 'hr-dl-modal';
    scrim.setAttribute('role', 'dialog');
    scrim.setAttribute('aria-modal', 'true');
    scrim.setAttribute('aria-label', 'Daily reward');
    scrim.innerHTML =
      '<div class="hr-dl-box">' +
        '<button class="hr-dl-close" data-dl-close="1" aria-label="Close" title="Close">&times;</button>' +
        '<div class="hr-dl-eyebrow">Daily reward · ' + streakCount(G) + '-day streak' + (wk ? ' · week ' + (wk + 1) : '') + '</div>' +
        '<div class="hr-dl-h">' + (streakCount(G) > 1 ? 'Welcome back!' : 'Your daily reward') + '</div>' +
        '<div class="hr-dl-week">' + week + '</div>' +
        (claimable
          ? '<button class="hr-dl-claim" data-dl-claim="1">Claim Day ' + day + ' · ' + rewardText(rewardFor(G)) + '</button>'
          : '<div class="hr-dl-eyebrow">Come back tomorrow for Day ' + ((day % 7) + 1) + '</div>') +
        '<div class="hr-dl-hint">Click anywhere to close — your reward stays on the Home screen.</div>' +
      '</div>';
    /* ══════════════════════════════════════════════════════════════════════
       b345 — EVERY CLICK THIS SHEET INTERCEPTS NOW PRODUCES A VISIBLE RESULT.

       MEASURED, on a real first boot (storage cleared, tour finished, Skills ›
       Woodcutting): the sheet's PANEL — `.hr-dl-box`, 420×242 dead centre —
       sat on top of the first gathering tile, and the handler below only ever
       reacted to two things: the claim button, and `e.target === scrim`. A
       click that landed on the panel matched neither, so it did nothing at
       all: no claim, no dismissal, no feedback, sheet still up. Four
       consecutive clicks on "Normal Tree" were swallowed with `activeSkill`
       still null and the scrim still present. There was also NO close control
       of any kind (measured: `hasCloseControl: false`), so nothing on screen
       told the player that the dark area — and only the dark area — was the
       way out.

       Round 2 wipes every beta save to first boot, so this is the opening
       interaction of the game for all twenty players.

       THE RULE IS NOW ONE RULE: the claim button claims; everything else
       closes. A modal is entitled to take the click that reaches it — that is
       what a modal is — but it is not entitled to take it SILENTLY, and it
       must never take the next one too. So:
         • a click on Claim claims and closes (unchanged);
         • a click ANYWHERE else — panel, backdrop, the day pills — closes;
         • the × states that in the corner and Escape does it from the
           keyboard;
         • and closing without claiming says where the reward went, because a
           reward that vanishes when you were aiming at a tree is exactly the
           silent loss this codebase keeps having to apologise for. It is
           still claimable: `isClaimable` is untouched and the Home card is
           the standing path.

       What this deliberately does NOT do: change WHEN the sheet opens. It
       auto-opens the instant the tour hands control back — i.e. precisely
       when the player is about to take their first action — and whether a
       retention pillar should front-door a player at that moment is the
       Designer's call, not a bug fix's. Filed as a handoff.
       ══════════════════════════════════════════════════════════════════════ */
    function close() {
      document.removeEventListener('keydown', onKey, true);
      scrim.remove();
    }
    function onKey(e) {
      /* SELF-EVICTING. `close()` unhooks this, but the sheet can also be torn
         out by anything that removes #hr-dl-modal (the suite does; so would a
         future "close every overlay" sweep), and a document-level keydown that
         outlives its own modal is a listener that fires forever — here it
         would toast "your reward is waiting" on every Escape press for the
         rest of the session. */
      if (!scrim.isConnected) { document.removeEventListener('keydown', onKey, true); return; }
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); dismiss(); }
    }
    function dismiss() {
      close();
      /* Only when there was something to claim — telling a player who already
         claimed today that "your reward is waiting" is a lie in the other
         direction. */
      if (isClaimable(window.G) && typeof window.notify === 'function') {
        window.notify('Daily reward still waiting — claim it on the Home screen.', 'info');
      }
      try { if (window.HearthriseHome && window.HearthriseHome.render) window.HearthriseHome.render(); } catch (er) {}
    }
    scrim.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-dl-claim]')) {
        var rw = claim(G);
        /* 'levelup' is the gold toast treatment; 'gold' was never a real
           toast type, so this toast had no tone at all. */
        if (rw && !rw._toastDeferred && typeof window.notify === 'function') window.notify('Daily reward: ' + rewardPlain(rw), 'levelup');
        close();
        try { if (window.HearthriseHome && window.HearthriseHome.render) window.HearthriseHome.render(); } catch (er) {}
        return;
      }
      dismiss();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(scrim);
    /* The claim button takes focus, so the FIRST Enter or Space a keyboard
       player presses claims the reward instead of reaching nothing. */
    try { var btn = scrim.querySelector('.hr-dl-claim'); if (btn) btn.focus({ preventScroll: true }); } catch (er) {}
  }

  /* b465 — THE SERVER'S CLAIM ROW IS THE MARKER, and this is its reader.
     The residue copy of lastClaimDay kept losing races (second tab, a save
     landing late) and each loss re-opened the sheet on a reward the server had
     already paid — twice now, in two costumes. Every envelope the client
     receives (hr_load at boot, hr-accrue each settle) carries the progress
     rows; both appliers hand them here. A daily/login row with state='claimed'
     for TODAY closes the question locally, whatever the residue thought. */
  function markServerClaim(rows) {
    try {
      if (!Array.isArray(rows)) return false;
      var G = window.G; var s = ensureState(G); if (!s) return false;
      var t = todayKey();
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!r || r.kind !== 'daily' || r.key !== 'login' || r.state !== 'claimed') continue;
        var p = String(r.period || '').split('-');            // '2026-8-24'
        if (p.length !== 3) continue;
        var key = (+p[0]) * 10000 + (+p[1]) * 100 + (+p[2]);
        if (key === t && s.lastClaimDay !== t) {
          s.lastClaimDay = t;
          // If the sheet is open on a claim the server already paid, fold it away.
          var open = document.getElementById('hr-dl-modal');
          if (open && open.remove) open.remove();
          return true;
        }
      }
    } catch (e) { /* a marker must never break an envelope */ }
    return false;
  }

  window.HearthriseDaily = {
    isClaimable: isClaimable,
    markServerClaim: markServerClaim,
    noteServerStreak: noteServerStreak,
    claim: claim,
    rewardFor: rewardFor,
    cycleDay: cycleDay,
    open: open,
    ensureState: ensureState,
    _blockingOverlays: function () { return BLOCKING_OVERLAYS; },
    _anotherModalUp: function () { return anotherModalUp(); }
  };

  // Gentle once-per-day auto-popup: wait for G, then only show when no other
  // modal/overlay is already up (never stack on welcome-back/beta/FTUE/rank-up).
  // b226: `.hr-id-scrim` (the name modal) and `#hr-post-signup-modal` were
  // MISSING from this list, so the once-a-day sheet landed straight on top of
  // both — found by walking the real post-login sequence in a browser, not by
  // reading the code. Every other first-run flow in the build already names
  // them; this one had been quietly exempt since b169.
  var BLOCKING_OVERLAYS = '.ftue-root,.hr-rn-scrim,.hr-id-scrim,.hr-gate,#hr-account-gate,' +
    '#hr-welcome-modal,#hr-post-signup-modal,.wbv-overlay,.beta-overlay,' +
    '[class*="welcome-overlay"],.acq-overlay,.ach-overlay';
  function anotherModalUp() {
    return !!document.querySelector(BLOCKING_OVERLAYS);
  }
  /* b462 — under the arm the "shown today" marker arrives with the residue
     (client_state), hydrated once per session at hr_load. Deciding before it
     lands re-opens the sheet on every reload. Wait for hydration (bounded —
     ~20s — so an offline/pre-arm boot still gets its sheet), never for G alone. */
  function residuePending() {
    try {
      var CS = window.HearthriseClientState;
      var armed = typeof window.clientMayWriteRecordField === 'function'
        && !window.clientMayWriteRecordField('gold');
      return !!(armed && CS && typeof CS.isClientStateHydrated === 'function' && !CS.isClientStateHydrated());
    } catch (e) { return false; }
  }
  function autoBoot(tries) {
    if (!window.G) { setTimeout(function () { autoBoot(tries); }, 500); return; }
    if (residuePending() && tries < 40) { setTimeout(function () { autoBoot(tries + 1); }, 500); return; }
    ensureState(window.G);
    if (!isClaimable(window.G)) return;              // already claimed today
    // Never stack onto another front-door overlay — keep waiting until it
    // clears. (The old 20-try cap force-opened this OVER the FTUE tour when
    // a new player took ~25s reading it.) The Home card remains the
    // fallback claim path if no quiet moment ever comes this session.
    if (anotherModalUp()) { setTimeout(function () { autoBoot(tries + 1); }, 1200); return; }
    open();
  }
  // b224: behind the account wall. autoBoot() would otherwise poll for
  // window.G forever every 500ms while the player is at the door — legacy
  // boot() is what publishes it, and that is exactly what the gate defers.
  function arm() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { autoBoot(0); }, 2200); });
    else setTimeout(function () { autoBoot(0); }, 2200);
  }
  if (window.HearthriseGate && typeof window.HearthriseGate.whenOpen === 'function') window.HearthriseGate.whenOpen(arm);
  else arm();

  console.log('[daily-reward] ready');
})();
