// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/coach.js — First Steps, played (b573).
//
// The guide is driven the way a player meets it: the REAL ringed control is
// clicked (it sends the real start/fight/sell gesture), the card must NOT move
// on the click, and only a server fact — pinned through HearthriseCoach.__pin
// and HearthriseReveal.__pin exactly as an envelope would state it — moves it
// on. The suite never pays anything: every gesture here is a start/stop or a
// sale whose answer is the harness's (unconfigured) transport.
// ══════════════════════════════════════════════════════════════════════
import { tryRunAsync, tryRun, assert, snapshotG, restoreG } from './_harness.js?v=572';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const START = () => ({ counts: {}, skills: { hitpoints: 1154 }, bag: { turnip_seed: 8, shrimp: 10, cooked_shrimp: 20 }, kills: {}, sold: false, activity: false });
const laid = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };

/** Pin one set of facts on both the coach and the reveal (the doors). */
function pinBoth(f) {
  const R = window.HearthriseReveal, C = window.HearthriseCoach;
  R.__pin(Object.assign({}, R.FRESH, { counts: Object.assign({}, f.counts), skills: Object.assign({}, f.skills), bag: Object.assign({}, f.bag) }));
  C.__pin(JSON.parse(JSON.stringify(f)));
}

/** Run `body` with the coach live on pinned facts; everything is put back after. */
async function withCoach(f, body) {
  const R = window.HearthriseReveal, C = window.HearthriseCoach;
  const snap = snapshotG();
  const wasR = R.__pin(null);
  const G = window.G, had = Object.prototype.hasOwnProperty.call(G, 'coachDismissed'), was = G.coachDismissed;
  G.coachDismissed = false;
  C.__reset();
  try {
    pinBoth(f);
    window.showTab('profile');
    return await body(C, f);
  } finally {
    C.__reset(); C.__draw.hide();
    R.__pin(wasR);
    try { if (typeof window.stopSkill === 'function') window.stopSkill(); } catch (e) {}
    try { if (typeof window.stopCombat === 'function') window.stopCombat(); } catch (e) {}
    document.querySelectorAll('#settings-modal.show').forEach((m) => m.classList.remove('show'));
    try { if (typeof window.closeInvDetail === 'function') window.closeInvDetail(); } catch (e) {}
    restoreG(snap);
    if (had) window.G.coachDismissed = was; else delete window.G.coachDismissed;
    window.showTab('profile');
  }
}

const title = () => ((document.querySelector('.hr-coach-card .hr-coach-title') || {}).textContent || '');
/** Tick, then follow the ring through the doors (click, as a player) until the target is ringed. */
async function toTarget(C, row) {
  for (let k = 0; k < 6; k++) {
    C.tick(); await sleep(350);
    const hit = C.resolve(row, C.lootId(C.facts().bag));
    assert(hit, row.id + ': nothing ringable on the way to the target');
    assert(C.__draw.currentAnchor() === hit.el, row.id + ': the ring is not on the deepest open hop');
    if (hit.last) return hit.el;
    hit.el.click(); await sleep(400);
  }
  throw new Error(row.id + ': never reached its target in six hops');
}
/** Wait out the done-tick and the next card's slide-in. */
async function settle(C) { C.tick(); await sleep(1100); C.tick(); await sleep(150); }

export default [

  /* -- player actions -- steps 1-5 played: each real gesture leaves the card where it
     is, and only the server's fact moves it on. A press outside the ring is swallowed. */
  () => tryRunAsync('COACH-1: First Steps plays steps 1-5 on real controls and advances only on server facts', async () => {
    const C = window.HearthriseCoach;
    assert(C && Array.isArray(C.steps) && C.steps.length === 10, 'window.HearthriseCoach is not published with its ten rows');
    await withCoach(START(), async (C, f) => {
      assert(C.tick() === 0 && /Welcome to the Hearth/.test(title()), 'a fresh hero did not open on the welcome card: ' + title());
      assert(laid(C.__draw.currentAnchor()) && C.__draw.currentAnchor().matches('.player-avatar'), 'the welcome card is not ringed on the hero portrait');
      document.querySelector('.hr-coach-card [data-coach-btn]').click();
      await settle(C);
      assert(/Chop your first logs/.test(title()), 'Let’s go did not move to the chop step: ' + title());

      /* The gate: a press on an unringed rail door is swallowed. */
      const wrong = [...document.querySelectorAll('.nav-btn[data-tab="character"], .bn-btn[data-tab="character"]')].find(laid);
      if (wrong) { wrong.click(); await sleep(150); assert(!document.getElementById('panel-character').classList.contains('active'), 'a press outside the ring reached the page'); }

      const plays = [
        ['chop', /Chop your first logs/, () => { f.counts.chopped = 15; f.skills.woodcutting = 300; }, /Catch some shrimp/],
        ['fish', /Catch some shrimp/, () => { f.counts.fished = 5; f.skills.fishing = 60; }, /Cook your catch/],
        ['cook', /Cook your catch/, () => { f.counts['ev:cooked'] = 5; f.skills.cooking = 150; }, /Your first fight/],
        ['fight', /Your first fight/, () => { f.kills.rat = 1; f.counts['ev:kill_any'] = 5; }, /Turn loot into gold/],
      ];
      for (const [id, now, serverSays, next] of plays) {
        const row = C.steps.find((r) => r.id === id);
        const target = await toTarget(C, row);
        assert(now.test(title()), id + ': expected its own card, got ' + title());
        target.click(); await sleep(300); C.tick(); await sleep(200);
        assert(now.test(title()), id + ': the click alone moved the guide on; only a server fact may (' + title() + ')');
        serverSays(); pinBoth(f);
        await settle(C);
        assert(next.test(title()), id + ': the server fact did not move the guide on: ' + title());
      }
    });
  }),

  /* -- regression suite -- a reload lands on the same step: nothing is stored but the facts. */
  () => tryRunAsync('COACH-2: a reload mid-step resumes on the same step', async () => {
    const f = START();
    f.counts.chopped = 15; f.skills.woodcutting = 300; f.counts.fished = 2; f.skills.fishing = 20;
    await withCoach(f, async (C) => {
      C.tick(); await sleep(200);
      const before = title();
      assert(/Catch some shrimp/.test(before), 'expected the fish step: ' + before);
      C.__reset(); pinBoth(f);                     // the page reloads: session state gone, facts unchanged
      C.tick(); await sleep(200);
      assert(title() === before, 'after a reload the guide moved from "' + before + '" to "' + title() + '"');
      /* A sale is answered, not re-stated: planting (persistent) carries the step past it. */
      Object.assign(f.counts, { fished: 5, 'ev:cooked': 5, 'ev:kill_any': 5, 'ev:planted': 1 }); f.kills.rat = 3;
      f.skills.cooking = 150; f.skills.fishing = 60;
      C.__reset(); pinBoth(f); C.tick(); await sleep(200);
      assert(/Leave it running/.test(title()), 'a reload after planting must resume past the sale: ' + title());
    });
  }),

  () => tryRunAsync('COACH-3: an advanced or returning account never sees the guide; a second hero does', async () => {
    const C = window.HearthriseCoach;
    assert(C.eligible({ gained: 0, slot: 0, ageMs: 1000 }) === true, 'a brand-new hero must be eligible');
    assert(C.eligible({ gained: 16, slot: 0, ageMs: 1000 }) === false, 'sixteen levels past the kit must never see it');
    assert(C.eligible({ gained: 3, slot: 0, ageMs: 2 * 86400000 }) === false, 'a two-day-old account on its first hero must never see it');
    assert(C.eligible({ gained: 0, slot: 1, ageMs: 30 * 86400000 }) === true, 'a second hero must re-run the guide');
    assert(C.eligible({ gained: null, slot: 0, ageMs: 0 }) === false, 'an unanswered record must not start the guide');
    const f = START(); f.skills = { hitpoints: 1154, woodcutting: 13034431 };
    await withCoach(f, async (C2) => {
      assert(C2.tick() === -1 && !document.querySelector('.hr-coach-root'), 'an advanced hero was shown the guide');
    });
  }),

  () => tryRunAsync('COACH-4: a locked door is never ringed', async () => {
    const f = START(); f.counts.chopped = 15; f.skills.woodcutting = 300;
    await withCoach(f, async (C) => {
      /* The coach says "fish", but the reveal still has Fishing shut (as if the
         envelope that opens it has not landed): the ring must not go through it. */
      window.HearthriseReveal.__pin(window.HearthriseReveal.FRESH);
      window.showTab('skills'); await sleep(200);
      C.tick(); await sleep(250);
      const a = C.__draw.currentAnchor();
      assert(!a || !(a.closest('.locked, .is-locked, [disabled], [data-reveal-locked]')), 'the ring sits on a locked control: ' + (a && a.outerHTML.slice(0, 120)));
      assert(!a || !/'fishing'|shrimp_s/.test(a.getAttribute('onclick') || ''), 'the ring went through the shut Fishing door');
      const row = C.steps.find((r) => r.id === 'fish');
      assert(C.resolve(row, 'rat_tail') === null || !/fishing|shrimp/.test(C.resolve(row, 'rat_tail').el.getAttribute('onclick') || ''), 'resolve() offered a hop behind a shut door');
    });
  }),

  () => tryRun('COACH-5: no card has a Next button unless it is an info card', () => {
    const C = window.HearthriseCoach;
    for (const r of C.steps) {
      if (r.kind === 'info') assert(r.primary, r.id + ': an info card needs its button');
      else assert(!r.primary && !r.secondary, r.id + ': an act card carries a button; it must finish on the server fact');
    }
    /* And on screen: an act card renders Skip guide and nothing else to press. */
    const D = C.__draw;
    D.show({ key: 't', kicker: '', title: 'x', body: 'y.', buttons: [], skip: 'Skip guide', onSkip() {} });
    try { assert(document.querySelectorAll('.hr-coach-card [data-coach-btn]').length === 0, 'an act card drew a button'); }
    finally { D.hide(); }
  }),

  /* The guard's DOM half (tests/coach-rows.mjs C6): every hop of every row
     resolves a laid-out, open element at this viewport, reached the way a
     player reaches it, and the card never covers its anchor. */
  () => tryRunAsync('COACH-6: every First Steps anchor exists in the DOM and the card never covers it', async () => {
    const C = window.HearthriseCoach;
    const f = START();
    const done = {
      chop: () => { f.counts.chopped = 15; f.skills.woodcutting = 300; },
      fish: () => { f.counts.fished = 5; f.skills.fishing = 60; },
      cook: () => { f.counts['ev:cooked'] = 5; f.skills.cooking = 150; },
      fight: () => { f.kills.rat = 1; f.counts['ev:kill_any'] = 5; f.bag.rat_tail = 2; window.G.inventory.rat_tail = 2; },
      sell: () => { f.sold = true; },
      plant: () => { f.counts['ev:planted'] = 1; },
      running: () => { f.activity = true; },
    };
    await withCoach(f, async () => {
      window.G._serverBag = { turnip_seed: 8, shrimp: 10, cooked_shrimp: 20 };
      for (const row of C.steps) {
        pinBoth(f);
        if (row.kind === 'info') {
          window.showTab(row.id === 'handoff' ? 'skills' : 'profile'); await sleep(150);
          C.__reset(); pinBoth(f);
          for (const r of C.steps) { if (r === row) break; if (r.kind === 'info') { C.tick(); const b = document.querySelector('.hr-coach-card [data-coach-btn]'); if (b) { b.click(); await sleep(700); } } }
        }
        const el = await toTarget(C, row);
        assert(laid(el), row.id + ': its target is not laid out');
        const a = el.getBoundingClientRect(), c = document.querySelector('.hr-coach-card').getBoundingClientRect();
        assert(c.left >= a.right || c.right <= a.left || c.top >= a.bottom || c.bottom <= a.top,
          row.id + ': the card covers its anchor (' + [a.left, a.top, a.right, a.bottom].map(Math.round) + ' vs ' + [c.left, c.top, c.right, c.bottom].map(Math.round) + ')');
        assert(c.left >= 0 && c.right <= innerWidth && c.top >= 0 && c.bottom <= innerHeight, row.id + ': the card is off screen');
        if (done[row.id]) { done[row.id](); pinBoth(f); await settle(C); }
        document.querySelectorAll('#settings-modal.show').forEach((m) => m.classList.remove('show'));
        try { if (typeof window.closeInvDetail === 'function') window.closeInvDetail(); } catch (e) {}
      }
    });
  }),
];
