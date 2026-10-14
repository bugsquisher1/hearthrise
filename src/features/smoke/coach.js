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
import { tryRunAsync, tryRun, assert, snapshotG, restoreG } from './_harness.js?v=580';
import { buildResiduePatch } from '../../net/capstone.js?v=580';
import { hydrateInto } from '../../net/client-state.js?v=580';

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
    /* A fresh hero: nothing running, the war table on Tier 1 with every family shown
       (earlier tests leave fights, filters and tiers behind; restoreG puts them back). */
    try { if (typeof window.stopCombat === 'function') window.stopCombat(); } catch (e) {}
    try { if (typeof window.stopSkill === 'function') window.stopSkill(); } catch (e) {}
    G.activeMonster = null; G.currentCombatTier = 1;
    window.showTab('combat');
    const back = document.querySelector('#panel-combat [data-cs-act="back"]');
    if (back && laid(back)) back.click();
    const all = document.querySelector('#panel-combat [data-cs-act="class"][data-cls="all"]');
    if (all && laid(all)) all.click();
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
  await until(C, () => title() === row.title, 5000);
  assert(title() === row.title, row.id + ': its card never came up (showing "' + title() + '")');
  for (let k = 0; k < 6; k++) {
    C.tick(); await sleep(350);
    const hit = C.resolve(row, C.lootId(C.facts().bag));
    assert(hit, row.id + ': nothing ringable on the way to the target');
    assert(C.__draw.currentAnchor() === hit.el, row.id + ': the ring is not on the deepest open hop');
    if (hit.last) return hit.el;
    hit.el.click(); await sleep(400);
  }
  const a = C.__draw.currentAnchor(), G = window.G || {};
  throw new Error(row.id + ': never reached its target in six hops (ringed: ' + (a ? a.className + ' ' + (a.getAttribute('data-monster') || a.getAttribute('data-tab') || '') : 'nothing')
    + ', fighting: ' + G.activeMonster + ', tier: ' + G.currentCombatTier + ', foe shown: ' + ((document.getElementById('arena-foe-name') || {}).textContent || '-') + ')');
}
/** Wait out the done-tick and the next card's slide-in. */
async function settle(C) { C.tick(); await sleep(1100); C.tick(); await sleep(150); }
/** Tick until `pred` holds or the deadline passes: the outcome, never a guessed duration. */
async function until(C, pred, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return true; C.tick(); await sleep(100); }
  return !!pred();
}

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
      await until(C, () => /Chop your first logs/.test(title()), 5000);
      assert(/Chop your first logs/.test(title()), 'Let’s go did not move to the chop step: ' + title());

      /* The gate: a press on an unringed rail door is swallowed. */
      const wrong = [...document.querySelectorAll('.nav-btn[data-tab="character"], .bn-btn[data-tab="character"]')].find(laid);
      if (wrong) { wrong.click(); await sleep(150); assert(!document.getElementById('panel-character').classList.contains('active'), 'a press outside the ring reached the page'); }

      const plays = [
        ['chop', /Chop your first logs/, () => { f.counts.chopped = 15; f.skills.woodcutting = 300; }, /Catch some shrimp/],
        ['fish', /Catch some shrimp/, () => { f.counts.fished = 5; f.skills.fishing = 60; }, /Cook your catch/],
        ['cook', /Cook your catch/, () => { f.counts['ev:cooked'] = 5; f.skills.cooking = 150; }, /Hunt in the Mill Cellar/],
        ['fight', /Hunt in the Mill Cellar/, () => { f.kills.rat = 1; f.counts['ev:kill_any'] = 5; }, /Turn loot into gold/],
      ];
      for (const [id, now, serverSays, next] of plays) {
        const row = C.steps.find((r) => r.id === id);
        const target = await toTarget(C, row);
        assert(now.test(title()), id + ': expected its own card, got ' + title());
        target.click(); await sleep(300); C.tick(); await sleep(200);
        assert(now.test(title()), id + ': the click alone moved the guide on; only a server fact may (' + title() + ')');
        serverSays(); pinBoth(f);
        await until(C, () => next.test(title()), 5000);
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
      /* Each layer on its own: an OPEN element behind a door the reveal holds shut,
         and a laid-out control the DOM marks locked, are both refused. */
      const open = '.nav-btn[data-tab="skills"], .bn-btn[data-tab="skills"]';
      assert([...document.querySelectorAll(open)].some(laid), 'CONTROL: no laid-out Skills door to test against');
      assert(C.hopElement({ sel: open }) !== null, 'CONTROL: an open door with no reveal row must resolve');
      assert(C.hopElement({ sel: open, reveal: 'pane:combat' }) === null, 'a hop behind the shut Combat door resolved');
      const probe = document.createElement('button');
      probe.className = 'locked hr-coach-probe'; probe.textContent = 'x';
      probe.style.cssText = 'position:fixed;left:40px;top:40px;width:60px;height:30px';
      document.body.appendChild(probe);
      try { assert(C.hopElement({ sel: '.hr-coach-probe' }) === null, 'a control the DOM marks locked resolved'); }
      finally { probe.remove(); }
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
        if (row.id === 'handoff') { window.showTab('skills'); await sleep(150); }
        const el = await toTarget(C, row);
        assert(laid(el), row.id + ': its target is not laid out');
        /* The card glides into place: measure where it SETTLES, never mid-slide
           (a loaded machine stretches the .28 s transition). */
        const cardEl = document.querySelector('.hr-coach-card');
        let c = cardEl.getBoundingClientRect();
        for (let i = 0; i < 40; i++) {
          await sleep(60);
          const n = cardEl.getBoundingClientRect();
          if (Math.abs(n.left - c.left) < 0.5 && Math.abs(n.top - c.top) < 0.5) break;
          c = n;
        }
        const a = el.getBoundingClientRect();
        assert(c.left >= a.right || c.right <= a.left || c.top >= a.bottom || c.bottom <= a.top,
          row.id + ': the card covers its anchor (' + [a.left, a.top, a.right, a.bottom].map(Math.round) + ' vs ' + [c.left, c.top, c.right, c.bottom].map(Math.round) + ')');
        assert(c.left >= 0 && c.right <= innerWidth && c.top >= 0 && c.bottom <= innerHeight, row.id + ': the card is off screen');
        if (done[row.id]) { done[row.id](); pinBoth(f); await settle(C); }
        if (row.kind === 'info' && row !== C.steps[C.steps.length - 1]) {
          /* Read and closed; "Later", never "Open Discord", so the suite opens no window. */
          const bs = [...document.querySelectorAll('.hr-coach-card [data-coach-btn]')];
          (bs.find((b) => /Later/.test(b.textContent)) || bs[bs.length - 1]).click();
          await sleep(800);
        }
        document.querySelectorAll('#settings-modal.show').forEach((m) => m.classList.remove('show'));
        try { if (typeof window.closeInvDetail === 'function') window.closeInvDetail(); } catch (e) {}
      }
    });
  }),

  /* -- interactive coverage -- THE ADVENTURES WINDOW. Tabs, a lock that
     says why, a star that survives the residue round trip, and the Hunt button's
     intent: start-hunt when the server takes it, the first spawn until then. */
  () => tryRunAsync('ADV-1: the Adventures window renders its four tabs and each pane', async () => {
    const CS = window.HearthriseCombatScreens, snap = snapshotG();
    try {
      try { window.stopCombat(); } catch (e) {}
      window.G.activeMonster = null;
      window.showTab('combat'); CS.setView('table');
      const tabs = [...document.querySelectorAll('#wt-tabs .wt-tab')].map((b) => b.textContent);
      assert(tabs.join() === 'Hunts,Bosses,Dungeons,Monsters', 'the tabs read ' + tabs.join());
      const want = { hunts: '#wt-hunts .wt-hunt', bosses: '#wt-bosses .wt-row', dungeons: '#wt-dungeons .wt-row', training: '#wt-grid .wt-card' };
      for (const k of Object.keys(want)) {
        document.querySelector('#wt-tabs [data-wtab="' + k + '"]').click();
        await sleep(30);
        const pane = document.querySelector('#panel-combat .wt-pane[data-wpane="' + k + '"]');
        assert(pane && !pane.hidden && pane.getBoundingClientRect().height > 0, k + ': its pane is not shown');
        assert(document.querySelector(want[k]), k + ': its pane drew nothing');
        assert(document.querySelector('#wt-tabs [data-wtab="' + k + '"]').getAttribute('aria-selected') === 'true', k + ': its tab is not selected');
      }
      assert(document.querySelector('#wt-hunts .wt-hunt[data-hunt="mill_cellar"] .wth-mon[data-monster="rat"]'), 'the Mill Cellar card lists no Giant Rat chip');
    } finally { CS.setTab('hunts'); restoreG(snap); window.showTab('profile'); }
  }),

  () => tryRunAsync('ADV-2: a hunt above the hero is locked and says the level it opens at', async () => {
    const CS = window.HearthriseCombatScreens, snap = snapshotG(), lv = window.getCombatLevel;
    try {
      window.getCombatLevel = () => 1;
      window.G.huntFavs = ['ridge_camp'];      // a star pins it inside the reveal window
      window.showTab('combat'); CS.setView('table'); CS.setTab('hunts');
      const card = document.querySelector('#wt-hunts .wt-hunt[data-hunt="ridge_camp"]');
      assert(card && card.classList.contains('is-locked'), 'Ridge Camp at Combat 1 is not locked');
      assert(/Opens at Combat 15/.test(card.textContent), 'the lock does not say why: ' + card.textContent.replace(/\s+/g, ' '));
      assert(!card.querySelector('[data-cs-act="hunt"]'), 'a locked hunt still offers a Hunt button');
      assert(document.querySelector('#wt-hunts .wt-hunt[data-hunt="mill_cellar"] [data-cs-act="hunt"]:not([disabled])'), 'the Mill Cellar is not open at Combat 1');
    } finally { window.getCombatLevel = lv; restoreG(snap); CS.render(); window.showTab('profile'); }
  }),

  () => tryRunAsync('ADV-3: a starred hunt survives the reload (residue round trip) and sorts first', async () => {
    const CS = window.HearthriseCombatScreens, snap = snapshotG();
    try {
      window.G.huntFavs = [];
      window.showTab('combat'); CS.setView('table'); CS.setTab('hunts');
      document.querySelector('#wt-hunts .wt-hunt[data-hunt="goblin_warren"] [data-cs-act="fav"]').click();
      assert(JSON.stringify(window.G.huntFavs) === '["goblin_warren"]', 'the star did not land in G.huntFavs: ' + JSON.stringify(window.G.huntFavs));
      const patch = buildResiduePatch(window.G);
      assert(JSON.stringify(patch.huntFavs) === '["goblin_warren"]', 'huntFavs does not ride the residue put');
      const reloaded = {};
      hydrateInto(reloaded, JSON.parse(JSON.stringify(patch)));
      assert(JSON.stringify(reloaded.huntFavs) === '["goblin_warren"]', 'huntFavs is not restored by the reload hydrate');
      window.G.huntFavs = reloaded.huntFavs; CS.render();
      const first = document.querySelector('#wt-hunts .wt-hunt');
      assert(first && first.dataset.hunt === 'goblin_warren' && first.querySelector('[aria-pressed="true"]'), 'the starred hunt is not first and lit');
      const forged = {};
      hydrateInto(forged, { huntFavs: ['ok_id', 'BAD ID', 5, 'ok_id'] });
      assert(JSON.stringify(forged.huntFavs) === '["ok_id"]', 'a forged huntFavs bag is not sanitised: ' + JSON.stringify(forged.huntFavs));
    } finally { restoreG(snap); CS.render(); window.showTab('profile'); }
  }),

  () => tryRunAsync('ADV-4: Hunt declares combat:<hunt id>, the attended kill rolls its spawns, and a locked start is worded', async () => {
    const CS = window.HearthriseCombatScreens, snap = snapshotG(), A = window.HearthriseActivity, lv = window.getCombatLevel;
    try {
      window.getCombatLevel = () => 1;
      const fb = CS.huntIntent('mill_cellar');
      assert(fb && fb.kind === 'combat' && fb.id === 'mill_cellar', 'the hunt intent is not combat:<hunt id>: ' + JSON.stringify(fb));
      try { window.stopCombat(); } catch (e) {}
      window.G.activeMonster = null;
      const sent = [];
      window.HearthriseActivity = Object.assign({}, A, { declare: (k, id) => { sent.push([k, id]); return null; } });
      window.showTab('combat'); CS.setView('table'); CS.setTab('hunts');
      document.querySelector('#wt-hunts .wt-hunt[data-hunt="mill_cellar"] [data-cs-act="hunt"]').click();
      assert(JSON.stringify(sent[sent.length - 1]) === '["combat","mill_cellar"]', 'the Hunt button sent ' + JSON.stringify(sent));
      assert(['rat', 'slime', 'hive_wasp'].includes(window.G.activeMonster), 'the hunt did not open on one of its spawns: ' + window.G.activeMonster);
      assert(window.localActivityPointer().id === 'mill_cellar', 'the local pointer names the foe, not the hunt: ' + JSON.stringify(window.localActivityPointer()));
      const ctx = window.HearthriseCombatSim.ctx();
      assert(ctx.hunt && ctx.hunt.id === 'mill_cellar' && ctx.hunt.spawns.length === 3, 'resolveKill gets no ctx.hunt on the attended path');
      window.stopCombat();
      assert(!window.HearthriseCombatSim.ctx().hunt, 'a stopped hunt still hands resolveKill its spawns');
      const msg = A.activityRefusalMessage('activity_locked', { ok: false, error: 'activity_locked', detail: { id: 'ridge_camp', combat_level: 6, band_min: 15 } });
      assert(/opens at Combat 15/.test(msg) && /Combat 6/.test(msg) && !/activity_locked/.test(msg), 'the locked refusal is not plain words: ' + msg);
    } finally {
      window.HearthriseActivity = A; window.getCombatLevel = lv;
      try { window.stopCombat(); } catch (e) {}
      CS.setView('table'); restoreG(snap); window.showTab('profile');
    }
  }),

  /* -- regression suite -- THE HUNT GRID THAT FLIPPED BETWEEN FOUR HUNTS AND
     THREE (live, 2026-10-14, Tyler on the QA account at Combat 56).
     The hunt grid, the Boss of the Day card and the Coming-up line read the
     level from the reveal, which read the fail-closed AUTHORITY accessor. Any
     answer that does not restate the skills map, or any write between two
     stamps, leaves the record unable to vouch for it; applyRecord also rebuilt
     its last-known copy from that answer alone, so the hero read as a fresh
     character (reach 0: three hunts, "next at Combat 15") until the next full
     envelope. Both shapes are driven here; the level must hold.
     MUTATION: spine-reveal serverRecord back to recordValue-only → RED (shape 2);
     record.js `last` rebuilt per fresh envelope → RED (shape 1, reveal and gate). */
  () => tryRunAsync('ADV-5 regression: a Combat-56 hero keeps Ridge Camp, the Boss card and the gate level while the skills record cannot vouch', async () => {
    const CS = window.HearthriseCombatScreens, R = window.HearthriseRecord, RV = window.HearthriseReveal, C = window.HearthriseCore;
    const G = window.G, snap = snapshotG(), rec0 = G._record;
    const pin0 = RV.__pin('live');
    const view0 = RV.__swapView({ counts: RV.FULL.counts, countsComplete: true, property: 6, workers: 6, companions: 6,
      bag: RV.FULL.bag, claimed: RV.FULL.claimed });
    try {
      try { window.stopCombat(); } catch (e) {}
      G.activeMonster = null;
      const combat = Object.keys(window.SKILLS_DEF).filter((k) => window.SKILLS_DEF[k].cat === 'combat');
      let lo = 0, hi = 13034431;
      while (lo < hi) { const mid = (lo + hi) >> 1; const m = {}; combat.forEach((k) => { m[k] = mid; }); if (C.xp.combatLevel(m) >= 56) hi = mid; else lo = mid + 1; }
      const skills = {};
      Object.keys(window.SKILLS_DEF).forEach((k) => { skills[k] = { xp: combat.indexOf(k) >= 0 ? lo : 0 }; });
      const v0 = (G._record && Number(G._record.version)) || 0;
      const full = (v) => ({ ok: true, version: v, now: new Date().toISOString(), state: { gold: 1000, gems: 0 }, skills, inventory: {} });
      R.applyRecord(G, full(v0 + 1));
      const lv = RV.combatLevel();
      assert(R.recordValue(G, 'skills').known && lv >= 56 && lv < 66, 'CONTROL: the fixture is not a vouched Combat-56 hero (reveal level ' + lv + ')');
      window.showTab('combat'); CS.setView('table'); CS.setTab('hunts');
      const read = () => {
        CS.render();
        return {
          hunts: [...document.querySelectorAll('#wt-hunts .wt-hunt')].map((e) => e.dataset.hunt).join(),
          more: (document.querySelector('#wt-hunts .wt-more') || {}).textContent || '',
          dests: CS._destinations().map((d) => d.rid + (d.locked ? '/' + d.locked : '')).join(),
          gate: window.hrGateLevel('attack'), level: RV.combatLevel(),
        };
      };
      const before = read();
      assert(before.hunts.split(',').indexOf('ridge_camp') >= 0, 'CONTROL: Ridge Camp (Combat 15+) is not on the grid for a vouched Combat-56 hero: ' + before.hunts);
      const B = window.HearthriseBossOfDay, did = B && B.featuredId && B.featuredId(), dm = did && window.MONSTERS[did];
      const botdIn = !!(dm && ((dm.tier || 1) - 1) * 15 <= lv + 10);
      if (botdIn) assert(/war:botd/.test(before.dests), 'CONTROL: the Boss of the Day card is missing for a vouched hero: ' + before.dests);
      const same = (shape) => {
        const after = read();
        assert(after.level === before.level, shape + ': the reveal level fell from ' + before.level + ' to ' + after.level + ' — the war table drew a fresh character');
        assert(after.hunts === before.hunts, shape + ': the hunt grid flipped from [' + before.hunts + '] to [' + after.hunts + '] ' + after.more);
        assert(after.dests === before.dests, shape + ': the destinations flipped from [' + before.dests + '] to [' + after.dests + ']');
        assert(after.gate === before.gate, shape + ': the attack gate level fell from ' + before.gate + ' to ' + after.gate + ' — a known level dropped to the fail-safe');
      };
      /* SHAPE 1 — a fresh answer that does not restate the skills map. */
      R.applyRecord(G, { ok: true, version: v0 + 2, now: new Date().toISOString(), state: { gold: 1001, gems: 0 } });
      assert(!R.recordValue(G, 'skills').known, 'CONTROL: the skills-less answer left the record vouching for the map');
      same('a skills-less answer');
      /* SHAPE 2 — a write between two stamps (the record reads client-overwrote). */
      R.applyRecord(G, full(v0 + 3));
      G.skills = Object.assign({}, G.skills, { attack: Number(G.skills.attack) + 1 });
      assert(R.recordValue(G, 'skills').source === 'client-overwrote', 'CONTROL: the write between stamps did not un-vouch the record');
      same('a write between stamps');
    } finally {
      RV.__swapView(view0); RV.__pin(pin0);
      restoreG(snap); window.G._record = rec0;
      CS.render(); window.showTab('profile');
    }
  }),

  /* -- interactive coverage -- THE "BIG CHANGES" NOTICE AND THE MONSTERS TAB.
     The notice shows once, its Open Monsters button lands on the full monster
     list, Got it hides it, and the dismissal rides the residue across a reload. */
  () => tryRunAsync('ADV-6: the notice shows, opens the Monsters list, stays dismissed after a reload, and meets the tap floor', async () => {
    const CS = window.HearthriseCombatScreens, G = window.G, snap = snapshotG();
    const had = Object.prototype.hasOwnProperty.call(G, 'noticesSeen'), was = G.noticesSeen;
    try {
      try { window.stopCombat(); } catch (e) {}
      G.activeMonster = null;
      delete G.noticesSeen;
      window.showTab('combat'); CS.setView('table'); CS.setTab('hunts');
      const note = document.getElementById('wt-notice');
      assert(note && !note.hidden && note.getBoundingClientRect().height > 0, 'the notice is not shown to a hero who has not dismissed it');
      assert(/Big changes are underway/.test(note.textContent) && /Monsters tab/.test(note.textContent), 'the notice does not say what changed and where the monsters are: ' + note.textContent);
      for (const b of note.querySelectorAll('button')) {
        assert(b.getBoundingClientRect().height >= 44, '"' + b.textContent + '" is ' + Math.round(b.getBoundingClientRect().height) + 'px tall, under the 44px tap floor');
      }
      note.querySelector('[data-cs-act="notice-monsters"]').click();
      await sleep(30);
      assert(CS.tab === 'training' && document.querySelector('#wt-tabs [data-wtab="training"]').textContent === 'Monsters', 'Open Monsters did not land on the Monsters tab');
      assert(document.querySelectorAll('#wt-grid .wt-card').length > 3, 'the Monsters tab does not list the monsters');
      assert(!note.hidden, 'opening the Monsters tab dismissed the notice; only Got it may');
      note.querySelector('[data-cs-act="notice-ok"]').click();
      assert(note.hidden && G.noticesSeen && G.noticesSeen['hunts-arrive'] === true, 'Got it did not hide the notice and record the dismissal');
      const patch = buildResiduePatch(G);
      assert(patch.noticesSeen && patch.noticesSeen['hunts-arrive'] === true, 'the dismissal does not ride the residue put');
      const reloaded = {};
      hydrateInto(reloaded, JSON.parse(JSON.stringify(patch)));
      delete G.noticesSeen; CS.render();
      assert(!note.hidden, 'CONTROL: the notice did not come back when the dismissal was cleared');
      G.noticesSeen = reloaded.noticesSeen; CS.render();
      assert(note.hidden, 'the notice came back after a reload restored the dismissal');
      const forged = {};
      hydrateInto(forged, { noticesSeen: { 'ok-id': true, 'BAD ID': true, other: 1 } });
      assert(JSON.stringify(forged.noticesSeen) === '{"ok-id":true}', 'a forged noticesSeen bag is not sanitised: ' + JSON.stringify(forged.noticesSeen));
    } finally {
      if (had) G.noticesSeen = was; else delete G.noticesSeen;
      CS.setTab('hunts'); restoreG(snap); CS.render(); window.showTab('profile');
    }
  }),

  /* -- regression suite -- THE NOTICE IS FOR HEROES WHO FOUGHT BEFORE HUNTS
     (Game Designer loop check 2026-10-14, #4). A brand-new hero met "Big changes
     are underway" on their first Combat visit, which is First Steps' fight step,
     announcing a change to a screen they had never seen. */
  () => tryRunAsync('ADV-7: the "big changes" notice never greets a hero who has not fought, a post-change account, or the guide', async () => {
    const CS = window.HearthriseCombatScreens, R = window.HearthriseReveal, G = window.G, snap = snapshotG();
    const had = Object.prototype.hasOwnProperty.call(G, 'noticesSeen'), was = G.noticesSeen;
    const pin0 = R.__pin(Object.assign({}, R.FRESH));
    try {
      try { window.stopCombat(); } catch (e) {}
      G.activeMonster = null;
      delete G.noticesSeen;
      window.showTab('combat'); CS.setView('table'); CS.setTab('hunts'); CS.render();
      const note = document.getElementById('wt-notice');
      assert(note && note.hidden, 'a hero the server says has won no fight sees the "big changes" notice');
      R.__pin(Object.assign({}, R.FRESH, { counts: { 'ev:kill_any': 40 } })); CS.render();
      assert(!note.hidden, 'CONTROL: a hero who has fought (and has not dismissed it) does not see the notice');
      const W = CS.noticeWanted, at = Date.parse('2026-10-14T06:30:00Z');
      assert(typeof W === 'function', 'noticeWanted is not exposed');
      assert(W({ kills: 40, accountAt: at - 1, guide: false }) === true, 'CONTROL: a pre-hunts account with fights is not shown the notice');
      assert(W({ kills: 40, accountAt: at, guide: false }) === false, 'an account made after hunts arrived is shown the notice');
      assert(W({ kills: 40, accountAt: null, guide: true }) === false, 'the notice shows while First Steps is speaking');
      assert(W({ kills: null, accountAt: null, guide: false }) === false, 'unknown kills read as "has fought"');
      assert(W({ kills: 0, accountAt: at - 1, guide: false }) === false, 'a hero with no fights sees the notice');
    } finally {
      R.__pin(pin0);
      if (had) G.noticesSeen = was; else delete G.noticesSeen;
      CS.setTab('hunts'); restoreG(snap); CS.render(); window.showTab('profile');
    }
  }),

  /* -- regression suite -- FIRST STEPS SHOWS THE REWARD IT EARNED (loop check
     2026-10-14, #7). The bar and Home's step card carry the Claim and both hide
     while the guide speaks, so steps 1-3 (500 gold, 30 raw shrimp, 5 turnip
     seeds) waited unseen until the hand-off. The card shows the waiting reward
     with one Claim that sends the pointer's own server claim, for that quest only. */
  () => tryRunAsync('COACH-REWARD-1: a step reward waiting shows on the guide card, and Claim sends that one quest once', async () => {
    const S = window.HearthriseSpine;
    const f = START();
    f.counts.chopped = 15; f.counts['ev:gather'] = 15; f.skills.woodcutting = 300;
    const fire0 = window.hrFireQuestClaim, sent = [];
    let release = null;
    window.hrFireQuestClaim = (q) => { sent.push(q && q.id); return new Promise((r) => { release = () => r({ ok: true }); }); };
    try {
      await withCoach(f, async (C) => {
        S.__forget();
        await until(C, () => title() === 'Catch some shrimp', 5000);
        C.tick(); await sleep(80);
        const btn = document.querySelector('.hr-coach-card [data-coach-claim]');
        assert(btn, 'the guide card shows no Claim for the 150 gold that chopping fifteen logs earned');
        const line = ((document.querySelector('.hr-coach-card .hr-coach-reward') || {}).textContent || '').replace(/\s+/g, ' ');
        assert(/Reward ready: 150 gold/.test(line), 'the reward line does not name the reward: ' + line);
        assert(btn.getBoundingClientRect().height >= 44, 'the Claim is under the 44px tap floor');
        btn.click(); btn.click();
        await sleep(40);
        assert(sent.length === 1 && sent[0] === 'gatherer', 'Claim sent ' + JSON.stringify(sent) + ', not one gatherer claim');
        const busy = document.querySelector('.hr-coach-card [data-coach-claim]');
        assert(busy && busy.disabled, 'the Claim stays pressable while its claim is in flight');
        release(); await sleep(80); C.tick(); await sleep(80);
        assert(!document.querySelector('.hr-coach-card [data-coach-claim]'), 'the Claim is still offered after the server paid it');
        assert(title() === 'Catch some shrimp', 'claiming moved the guide off its step: ' + title());
      });
    } finally { window.hrFireQuestClaim = fire0; S.__forget(); }
  }),
];
