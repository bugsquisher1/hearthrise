// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/spine-reveal.js — the progressive reveal on the real screens.
//
// The headless harness pins the reveal to FULL (it has no server), so the rest
// of the suite renders a seasoned account. These tests pin the other states
// through HearthriseReveal.__pin and read what a player would see.
// ══════════════════════════════════════════════════════════════════════
import { tryRunAsync, assert, snapshotG, restoreG } from './_harness.js?v=584';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Everything the reveal can gate, as ids, read off the live DOM. */
async function surfaces() {
  const shown = (el) => !!el && el.style.display !== 'none' && !el.hasAttribute('data-reveal-locked');
  const out = {};
  out.doors = [...document.querySelectorAll('.nav-btn[data-tab]')].filter(shown).map((b) => b.dataset.tab);
  out.lockedDoors = Object.fromEntries([...document.querySelectorAll('.nav-btn[data-tab][data-reveal-locked]')]
    .map((b) => [b.dataset.tab, b.getAttribute('data-reveal-locked')]));
  const N = window.HearthriseNav;
  out.panes = N.hubs.flatMap((h) => h.panes.map((p) => p.tab)).filter((t) => N.paneShown(t));
  window.showTab('skills'); await tick();
  out.skills = [...document.querySelectorAll('#skills-list .skill-tile:not([data-reveal-locked]) .snm')].map((e) => e.textContent);
  out.lockedSkills = [...document.querySelectorAll('#skills-list .skill-tile[data-reveal-locked]')].map((e) => e.querySelector('.snm').textContent + ': ' + e.getAttribute('data-reveal-locked'));
  out.lockedStrip = [...document.querySelectorAll('#act-mob-strip .ams-btn[data-reveal-locked]')].map((b) => b.dataset.skill);
  out.recipeBook = shown(document.getElementById('btn-recipe-book'));
  window._charPane = 'skills';
  window.showTab('character'); await new Promise((r) => setTimeout(r, 60));
  if (typeof window.renderCharacter === 'function') window.renderCharacter();
  out.charSkills = [...document.querySelectorAll('#csk-grid-host .csk-tile:not([data-reveal-locked]) .csk-nm')].map((e) => e.textContent);
  out.lockedChar = document.querySelectorAll('#csk-grid-host .csk-tile[data-reveal-locked]').length;
  window.showTab('combat'); await tick();
  const CS = window.HearthriseCombatScreens;
  CS.render();
  out.wars = CS._destinations().map((d) => d.kick);
  out.tiers = [...document.querySelectorAll('#wt-tiers .chip')].map((e) => e.textContent);
  window.showTab('profile'); await tick();
  if (window.HearthriseHome) window.HearthriseHome.render();
  out.home = [...document.querySelectorAll('#hd-root .hd-h h3')].map((e) => e.textContent);
  return out;
}


/** Facts in which every step before `k` is done and step `k` is current. */
function atStep(R, k) {
  const f = JSON.parse(JSON.stringify(R.FRESH));
  f.counts = {}; f.products = {};
  R.steps.filter((s) => s.step < k).forEach((s) => s.need.forEach((n) => {
    if (n.fact === 'count') f.counts[n.key] = Math.max(f.counts[n.key] || 0, n.min);
    if (n.fact === 'property') f.property = Math.max(f.property, n.min);
    if (n.fact === 'workers') f.workers = Math.max(f.workers, n.min);
    if (n.fact === 'combat') f.skills = Object.assign({}, f.skills, { attack: 1e6, strength: 1e6, defense: 1e6 });
    if (n.fact === 'item') f.bag = Object.assign({}, f.bag, { [n.id]: n.min });
    if (n.fact === 'cleared') f.counts['dungeon_clear:' + n.dungeon] = n.min;
  }));
  return f;
}

const ROUTE_KINDS = ['fl', 'q', 'mile', 'cook', 'trainskill', 'house', 'active', 'collection'];

/** Click every route on Home with navigation stubbed; returns every place a
    click tried to take the player. (The Quests modal left with the dailies.) */
async function walkRoutes() {
  const W = window, saved = { showTab: W.showTab, skill: W.openSkillDetail };
  const went = [];
  W.showTab('profile');
  if (W.HearthriseHome) W.HearthriseHome.render();
  const homeEls = [...document.querySelectorAll('#hd-root [data-hd]')].filter((el) => ROUTE_KINDS.indexOf(el.getAttribute('data-hd')) >= 0);
  try {
    W.showTab = (t) => { went.push({ from: 'home', tab: t }); };
    W.openSkillDetail = (id) => { went.push({ from: 'home', skill: id }); };
    homeEls.forEach((el) => { try { el.click(); } catch (e) {} });
  } finally {
    W.showTab = saved.showTab; W.openSkillDetail = saved.skill;
  }
  return { went, clicked: homeEls.length };
}

function shutRoutes(R, went) {
  const N = window.HearthriseNav;
  const isPane = (t) => N.hubs.some((h) => h.panes.some((p) => p.tab === t));
  return went.filter((w) => w.skill ? !R.shows('skill:' + w.skill)
    : isPane(w.tab) ? !R.shows('pane:' + w.tab) : !N.doorShown(w.tab));
}

async function withPin(pin, body) {
  const R = window.HearthriseReveal;
  const snap = snapshotG();
  const was = R.__pin(pin);
  try { return await body(R); } finally { R.__pin(was); restoreG(snap); window.showTab('profile'); }
}

export default [

  () => tryRunAsync('SPINE-REVEAL-1: a fresh character has four open doors and one open skill; everything else is shown LOCKED with the step that opens it', async () => {
    const R = window.HearthriseReveal;
    assert(R && typeof R.shows === 'function', 'window.HearthriseReveal is not published');
    await withPin(R.FRESH, async () => {
      const s = await surfaces();
      assert(s.doors.join(',') === 'profile,character,skills,shops', 'fresh doors: ' + s.doors.join(','));
      assert(s.skills.join(',') === 'Woodcutting', 'fresh Skills list: ' + s.skills.join(','));
      assert(s.charSkills.join(',') === 'Woodcutting', 'fresh Character skill grid: ' + s.charSkills.join(','));
      assert(!s.recipeBook, 'the Recipe Book button shows before the crafting step');
      assert(s.home.indexOf('Your heroes') < 0 && s.home.indexOf('The realm') < 0, 'fresh Home shows step-10 cards: ' + s.home.join(','));
      assert(R.state().progress.current === 1, 'a fresh character is not on step 1');
      /* Locked, never hidden: every other door is on the rail and says which step opens it. */
      assert(s.lockedDoors.combat === 'Opens when you catch and cook five fish (Step 2).', 'Combat door reason: ' + s.lockedDoors.combat);
      assert(s.lockedDoors.homestead === 'Opens when you win five fights (Step 3).', 'Homestead door reason: ' + s.lockedDoors.homestead);
      assert(s.lockedDoors.social, 'a door is hidden instead of locked: ' + JSON.stringify(s.lockedDoors));
      assert(s.lockedSkills.indexOf('Fishing: Opens when you chop fifteen logs (Step 1).') >= 0 && s.lockedSkills.length >= 7,   // 15 skills since stonemason and bountyHunter left
        'locked skills are missing or unexplained: ' + s.lockedSkills.join(' | '));
      assert(s.lockedStrip.indexOf('mining') >= 0 && s.lockedStrip.indexOf('woodcutting') < 0, 'the phone activity strip does not lock unreached skills: ' + s.lockedStrip);
      assert(s.lockedChar >= 14, 'the Character grid hides skills instead of locking them: ' + s.lockedChar);
      /* A locked door does not open: the click is the reason card, with a way to the current step. */
      const before = document.querySelector('main .panel.active').id;
      document.querySelector('.nav-btn[data-tab="combat"]').click();
      const pop = document.getElementById('hr-lock-pop');
      try {
        assert(document.querySelector('main .panel.active').id === before, 'a click walked through a locked door');
        assert(pop && /catch and cook five fish \(Step 2\)/.test(pop.textContent), 'the locked door gave no reason card');
        assert(pop.querySelector('[data-lock-act="go"]'), 'the reason card has no Show me');
      } finally { if (window.HearthriseLocks) window.HearthriseLocks.close(); }
    });
  }),

  () => tryRunAsync('SPINE-REVEAL-2: a fully progressed account renders exactly what the game rendered before the reveal', async () => {
    const R = window.HearthriseReveal;
    const full = await withPin(R.FULL, () => surfaces());
    const off = await withPin(R.FULL, async () => {
      const had = window.HearthriseReveal;
      window.HearthriseReveal = undefined;
      try { return await surfaces(); } finally { window.HearthriseReveal = had; }
    });
    for (const k of Object.keys(off)) {
      assert(JSON.stringify(full[k]) === JSON.stringify(off[k]),
        `full account "${k}" differs from the unrevealed game: ${JSON.stringify(full[k])} vs ${JSON.stringify(off[k])}`);
    }
    // Seven doors since the Clan and Events doors left (2026-10-14 demolition).
    assert(full.doors.length === 7 && full.tiers.length === 6, 'the full account lost doors or tiers: ' + full.doors + ' / ' + full.tiers);
  }),

  () => tryRunAsync('SPINE-REVEAL-3: a client-only flag cannot reveal anything', async () => {
    await withPin('live', async (R) => {
      const view = R.__swapView(null);
      /* "Never stated" is made true here rather than inherited from whatever
         record an earlier test left: the reveal holds the server's LAST statement
         (record.js recordLastKnown), so the precondition is no record at all. */
      const rec0 = window.G._record;
      window.G._record = null;
      try {
        const G = window.G;
        G.skills = Object.assign({}, G.skills, { attack: 5000000, farming: 5000000, crafting: 5000000 });
        G.homestead = { tier: 6 };
        G.workers = { hired: [{ uid: 'forged', name: 'Forged' }] };
        G.stats = Object.assign({}, G.stats, { kills: 9999, harvested: 99 });
        G.inventory = Object.assign({}, G.inventory, { bone_key: 3 });
        G.equipment = Object.assign({}, G.equipment, { boots: 'leather_boots' });
        R.check();
        /* A product row stays shut until its product is live (S7), whatever its step; a live one (a code switch, not G) opens at its step. */
        const live = R.facts().products || {};
        const step1 = R.rows.filter((r) => r.step <= 1 && (!r.product || live[r.product])).map((r) => r.id).sort();
        const shown = [...R.state().shown].sort();
        assert(JSON.stringify(shown) === JSON.stringify(step1) && shown.indexOf('pane:shop') >= 0,
          'client-written G revealed: ' + shown.filter((id) => step1.indexOf(id) < 0).join(', '));
        assert(R.combatLevel() === null, 'the reveal read a combat level the server never stated');
        /* Once the server HAS stated a map, a client write over it still moves
           nothing: the reveal holds the stated level, never the forged one. */
        const stated = {};
        Object.keys(G.skills).forEach((k) => { stated[k] = { xp: 0 }; });
        window.HearthriseRecord.applyRecord(G, { ok: true, version: 1, state: { gold: 0, gems: 0 }, skills: stated, inventory: {} });
        const lv0 = R.combatLevel();
        assert(typeof lv0 === 'number' && lv0 < 10, 'CONTROL: the stated all-zero map does not read as a low level (' + lv0 + ')');
        G.skills = Object.assign({}, G.skills, { attack: 5000000, strength: 5000000, defense: 5000000, hitpoints: 5000000 });
        assert(R.combatLevel() === lv0, 'a client write over a stated map moved the reveal level from ' + lv0 + ' to ' + R.combatLevel());
        window.G._record = null;
        /* Control: the same facts arriving in an ENVELOPE do reveal. */
        R.noteEnvelope({ progress_truncated: false, state: { slot: 1 }, workers: [{ uid: 'w1' }],
          progress: [{ kind: 'stat', period: '', key: 'chopped', value: 20 }, { kind: 'stat', period: '', key: 'ev:kill_any', value: 3 },
            { kind: 'unlock', period: '', key: 'property:homestead', value: 1 }] });
        assert(R.shows('skill:fishing') && R.shows('pane:house') && R.shows('card:workers'),
          'a server envelope did not reveal what it confirms: ' + [...R.state().shown].join(','));
      } finally { R.__swapView(view); window.G._record = rec0; }
    });
  }),

  () => tryRunAsync('SPINE-REVEAL-4: an unknown fact never hides a door the server confirms', async () => {
    const R = window.HearthriseReveal;
    await withPin({ counts: {}, countsComplete: false, skills: null, property: 1, workers: null, bag: {} }, async () => {
      const s = await surfaces();
      assert(s.doors.indexOf('homestead') >= 0, 'the Homestead door is hidden from a player the server says owns a Homestead: ' + s.doors);
      assert(R.shows('pane:house'), 'the House pane is hidden from a player the server says owns a Homestead');
    });
  }),

  () => tryRunAsync('SPINE-REVEAL-5: the Vigour chip waits until half the day is spent, and Vigour waits for its step', async () => {
    const VM = window.HearthriseVigourMount;
    assert(VM && typeof VM.worthSaying === 'function', 'vigour-mount does not publish worthSaying');
    const m = (left) => ({ budget_min: 1000, spent_min: 1000 - left, remaining_min: left });
    assert(!VM.worthSaying(m(626)) && VM.worthSaying(m(500)) && VM.worthSaying(m(0)), 'the half-day line is wrong');
    assert(VM.worthSaying(null) && VM.worthSaying({ remaining_min: 5 }), 'an unreadable meter must keep the chip');
    await withPin(window.HearthriseReveal.FRESH, async (R) => {
      assert(!R.shows('card:vigour'), 'Vigour shows before its step');
    });
  }),

  () => tryRunAsync('SPINE-REVEAL-6: the Local Shop is open from the first minute', async () => {
    const R = window.HearthriseReveal;
    assert(R.rows.find((r) => r.id === 'pane:shop').step === 0, 'the Local Shop is not a step-0 row');
    await withPin({}, async () => {
      assert(R.shows('pane:shop') && window.HearthriseNav.doorShown('shops'), 'the Local Shop is shut while the server has said nothing');
    });
  }),



  () => tryRunAsync('SPINE-REVEAL-9: a door opens when its step becomes current, never earlier, and no step waits behind a shut door', async () => {
    const R = window.HearthriseReveal;
    const skip2 = atStep(R, 11);
    skip2.counts['ev:cooked'] = 0;
    await withPin(skip2, async () => {
      assert(R.state().progress.current === 2, 'step 2 is not current with only it open');
      assert(!R.shows('card:vigour'), 'a later step opened its doors out of order');
      assert(R.shows('pane:market'), 'the Player Market is hidden at step 2 — it is open from minute 0 for every hero');
    });
    for (let k = 1; k <= R.steps.length; k++) {
      await withPin(atStep(R, k), async () => {
        assert(R.state().progress.current === k, 'step ' + k + ' is not current at its boundary');
        const shut = R.steps[k - 1].via.filter((id) => !R.shows(id));
        assert(!shut.length, 'DEADLOCK: step ' + k + ' is current but ' + shut.join(', ') + ' is shut');
      });
    }
    await withPin(atStep(R, 7), async () => {
      window.showTab('skills'); await tick();
      const names = [...document.querySelectorAll('#skills-list .skill-tile .snm')].map((e) => e.textContent);
      assert(names.indexOf('Crafting') >= 0, 'the crafting bench is hidden while step 7 asks for a craft: ' + names);
    });
  }),

  () => tryRunAsync('SPINE-REVEAL-10: every Go route on Home leads through an open door', async () => {
    const R = window.HearthriseReveal;
    const mid = { counts: { chopped: 20, fished: 6, 'ev:cooked': 6, 'ev:kill_any': 8, 'ev:planted': 2 }, countsComplete: true,
      skills: { hitpoints: 2000, attack: 600, woodcutting: 900 }, property: 1, workers: 0, companions: 0, bag: {}, products: {} };
    const states = [['fresh', R.FRESH], ['mid', mid]];
    for (let k = 1; k <= R.steps.length + 1; k++) states.push(['step ' + k, atStep(R, k)]);
    let walked = 0;
    for (const [name, f] of states) {
      await withPin(f, async () => {
        const { went } = await walkRoutes();
        walked += went.length;
        const bad = shutRoutes(R, went);
        assert(!bad.length, name + ': a route leads to a shut door: ' + JSON.stringify(bad.slice(0, 4)));
      });
    }
    assert(walked > 0, 'the walk clicked no route at all, so it proved nothing');
  }),

  /* SPINE-REVEAL-11 retired with the six-step tour (b573): First Steps never
     points at a shut door at all (COACH-4 in src/features/smoke/coach.js). */

  () => tryRunAsync('SPINE-REVEAL-12: an account that owns two heroes sees the switcher at step 2', async () => {
    const R = window.HearthriseReveal, HP = window.HearthriseProfile;
    assert(HP, 'HearthriseProfile is not published');
    const had = { profile: HP.profile, rows: HP.slotRows };
    const rows = [{ kind: 'char', id: 0, name: 'Ash', active: true, combatLv: 3, totalLv: 20 },
      { kind: 'char', id: 1, name: 'Bryn', active: false, combatLv: 2, totalLv: 9 },
      { kind: 'locked', id: 2, slotId: 2, cost: 100 }];
    try {
      HP.profile = HP.profile || { id: 'qa' };
      HP.slotRows = () => rows;
      await withPin(atStep(R, 2), async () => {
        window.showTab('profile'); window.HearthriseHome.render(); await tick();
        assert([...document.querySelectorAll('#hd-root [data-hero]')].length === 1, 'a second owned hero has no Play button at step 2');
        assert(!document.querySelector('#hd-root [data-herobuy]'), 'an empty slot for sale shows before step 10');
      });
      rows.splice(1, 1);
      await withPin(atStep(R, 2), async () => {
        window.HearthriseHome.render(); await tick();
        const h3 = [...document.querySelectorAll('#hd-root .hd-h h3')].map((e) => e.textContent);
        assert(h3.indexOf('Your heroes') < 0, 'a one-hero account shows the switcher before step 10');
      });
    } finally { HP.profile = had.profile; HP.slotRows = had.rows; }
  }),

  () => tryRunAsync('SPINE-REVEAL-13: the Discord button is on screen at every step, with a "!" until it is opened or dismissed', async () => {
    const R = window.HearthriseReveal, D = window.HearthriseDiscord, G = window.G;
    assert(D && typeof D.paintButtons === 'function', 'HearthriseDiscord.paintButtons is not published');
    const had = Object.prototype.hasOwnProperty.call(G, 'discordSeen'), was = G.discordSeen;
    const noNav = (e) => { if (e.target.closest && e.target.closest('[data-hr-discord-btn]')) e.preventDefault(); };
    window.addEventListener('click', noNav, true);
    try {
      for (let k = 1; k <= R.steps.length + 1; k++) {
        await withPin(atStep(R, k), async () => {
          D.paintButtons();
          assert(document.querySelector('.hr-dc-wrap [data-hr-discord-btn]'), 'no Discord button at step ' + k);
        });
      }
      delete G.discordSeen; D.paintButtons();
      assert(document.querySelector('.hr-dc-wrap.is-top .hr-dc-bang'), 'a fresh account has no "!" on the Discord button');
      assert(/meet players, report bugs, get 25 gems/.test(document.querySelector('[data-hr-discord-btn]').title), 'the tooltip is wrong');
      document.querySelector('.hr-dc-wrap.is-top [data-hr-discord-gotit]').click();
      assert(G.discordSeen === true && !document.querySelector('.hr-dc-bang'), '"Got it" did not clear the "!"');
      delete G.discordSeen; D.paintButtons();
      document.querySelector('.hr-dc-wrap.is-top [data-hr-discord-btn]').click();
      assert(G.discordSeen === true && !document.querySelector('.hr-dc-bang'), 'opening the Discord did not clear the "!"');
    } finally {
      window.removeEventListener('click', noNav, true);
      if (had) G.discordSeen = was; else delete G.discordSeen;
      D.paintButtons();
    }
  }),
];
