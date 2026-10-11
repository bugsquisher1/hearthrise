// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/spine-reveal.js — the progressive reveal on the real screens.
//
// The headless harness pins the reveal to FULL (it has no server), so the rest
// of the suite renders a seasoned account. These tests pin the other states
// through HearthriseReveal.__pin and read what a player would see.
// ══════════════════════════════════════════════════════════════════════
import { tryRunAsync, assert, snapshotG, restoreG } from './_harness.js?v=569';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Everything the reveal can gate, as ids, read off the live DOM. */
async function surfaces() {
  const shown = (el) => !!el && el.style.display !== 'none';
  const out = {};
  out.doors = [...document.querySelectorAll('.nav-btn[data-tab]')].filter(shown).map((b) => b.dataset.tab);
  const N = window.HearthriseNav;
  out.panes = N.hubs.flatMap((h) => h.panes.map((p) => p.tab)).filter((t) => N.paneShown(t));
  window.showTab('skills'); await tick();
  out.skills = [...document.querySelectorAll('#skills-list .skill-tile .snm')].map((e) => e.textContent);
  out.recipeBook = shown(document.getElementById('btn-recipe-book'));
  window._charPane = 'skills';
  window.showTab('character'); await new Promise((r) => setTimeout(r, 60));
  if (typeof window.renderCharacter === 'function') window.renderCharacter();
  out.charSkills = [...document.querySelectorAll('#csk-grid-host .csk-nm')].map((e) => e.textContent);
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
  }));
  return f;
}

const ROUTE_KINDS = ['fl', 'q', 'mile', 'cook', 'trainskill', 'house', 'active', 'collection'];

/** Click every route on Home and in the Quests modal with navigation stubbed;
    returns every place a click tried to take the player. */
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
  if (typeof W.openQuestsModal === 'function') {
    W.openQuestsModal(); await tick();
    const ids = [...document.querySelectorAll('#quests-modal-overlay button[data-goto]')].map((b) => [b.dataset.goto, b.dataset.weekly]);
    W.closeQuestsModal();
    for (const [id, wk] of ids) {
      W.openQuestsModal(); await tick();
      const btn = document.querySelector('#quests-modal-overlay button[data-goto="' + id + '"][data-weekly="' + wk + '"]');
      try {
        W.showTab = (t) => { went.push({ from: 'quests ' + id, tab: t }); };
        W.openSkillDetail = (sid) => { went.push({ from: 'quests ' + id, skill: sid }); };
        if (btn) btn.click();
      } finally { W.showTab = saved.showTab; W.openSkillDetail = saved.skill; W.closeQuestsModal(); }
    }
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

  () => tryRunAsync('SPINE-REVEAL-1: a fresh character sees four doors and one skill', async () => {
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
      /* The tour must not spotlight a door the reveal holds back (it would point at 0,0). */
      const F = window.HearthriseFTUE;
      assert(F && typeof F.findTarget === 'function', 'HearthriseFTUE.findTarget is not published');
      assert(F.findTarget('button[data-tab="combat"]') === null, 'the tour still targets the hidden Combat door');
      assert(F.findTarget('button[data-tab="skills"]'), 'the tour lost the visible Skills door');
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
    assert(full.doors.length === 9 && full.tiers.length === 6, 'the full account lost doors or tiers: ' + full.doors + ' / ' + full.tiers);
  }),

  () => tryRunAsync('SPINE-REVEAL-3: a client-only flag cannot reveal anything', async () => {
    await withPin('live', async (R) => {
      const view = R.__swapView(null);
      try {
        const G = window.G;
        G.skills = Object.assign({}, G.skills, { attack: 5000000, farming: 5000000, crafting: 5000000 });
        G.homestead = { tier: 6 };
        G.workers = { hired: [{ uid: 'forged', name: 'Forged' }] };
        G.stats = Object.assign({}, G.stats, { kills: 9999, harvested: 99 });
        G.inventory = Object.assign({}, G.inventory, { bone_key: 3 });
        G.equipment = Object.assign({}, G.equipment, { boots: 'leather_boots' });
        R.check();
        const step1 = R.rows.filter((r) => r.step <= 1).map((r) => r.id).sort();
        const shown = [...R.state().shown].sort();
        assert(JSON.stringify(shown) === JSON.stringify(step1) && shown.indexOf('pane:shop') >= 0,
          'client-written G revealed: ' + shown.filter((id) => step1.indexOf(id) < 0).join(', '));
        assert(R.combatLevel() === null, 'the reveal read a combat level the server never stated');
        /* Control: the same facts arriving in an ENVELOPE do reveal. */
        R.noteEnvelope({ progress_truncated: false, state: { slot: 1 }, workers: [{ uid: 'w1' }],
          progress: [{ kind: 'stat', period: '', key: 'chopped', value: 20 }, { kind: 'stat', period: '', key: 'kills', value: 3 },
            { kind: 'unlock', period: '', key: 'property:homestead', value: 1 }] });
        assert(R.shows('skill:fishing') && R.shows('pane:house') && R.shows('card:workers'),
          'a server envelope did not reveal what it confirms: ' + [...R.state().shown].join(','));
        assert(!R.shows('pane:market'), 'an envelope revealed a step it did not reach');
      } finally { R.__swapView(view); }
    });
  }),

  () => tryRunAsync('SPINE-REVEAL-4: an unknown fact never hides a door the server confirms', async () => {
    const R = window.HearthriseReveal;
    await withPin({ counts: {}, countsComplete: false, skills: null, property: 1, workers: null, bag: { bone_key: 1 } }, async () => {
      const s = await surfaces();
      assert(s.doors.indexOf('homestead') >= 0, 'the Homestead door is hidden from a player the server says owns a Homestead: ' + s.doors);
      assert(s.doors.indexOf('combat') >= 0 && R.shows('pane:dungeons'), 'a held dungeon key did not reveal the Dungeons pane');
    });
  }),

  () => tryRunAsync('SPINE-REVEAL-5: the Vigour chip waits until half the day is spent, and Vigour waits for its step', async () => {
    const VM = window.HearthriseVigourMount;
    assert(VM && typeof VM.worthSaying === 'function', 'vigour-mount does not publish worthSaying');
    const m = (left) => ({ budget_min: 1000, spent_min: 1000 - left, remaining_min: left });
    assert(!VM.worthSaying(m(626)) && VM.worthSaying(m(500)) && VM.worthSaying(m(0)), 'the half-day line is wrong');
    assert(VM.worthSaying(null) && VM.worthSaying({ remaining_min: 5 }), 'an unreadable meter must keep the chip');
    await withPin(window.HearthriseReveal.FRESH, async (R) => {
      assert(!R.shows('card:vigour') && !R.shows('pane:bounty'), 'Vigour or the Bounty Board shows before step 9');
    });
  }),

  () => tryRunAsync('SPINE-REVEAL-6: the Local Shop is open from the first minute', async () => {
    const R = window.HearthriseReveal;
    assert(R.rows.find((r) => r.id === 'pane:shop').step === 0, 'the Local Shop is not a step-0 row');
    await withPin({}, async () => {
      assert(R.shows('pane:shop') && window.HearthriseNav.doorShown('shops'), 'the Local Shop is shut while the server has said nothing');
    });
  }),

  () => tryRunAsync('SPINE-REVEAL-7: the Stable opens on an owned companion or at step 10', async () => {
    const R = window.HearthriseReveal;
    await withPin(Object.assign({}, R.FRESH, { property: 1 }), async () => {
      assert(!R.shows('pane:stable'), 'the Stable opened with the Homestead and no companion');
    });
    await withPin(Object.assign({}, R.FRESH, { companions: 1 }), async () => {
      assert(R.shows('pane:stable') && window.HearthriseNav.doorShown('homestead'), 'a server-owned companion did not open the Stable');
    });
    await withPin(atStep(R, 10), async () => { assert(R.shows('pane:stable'), 'step 10 did not open the Stable'); });
    await withPin('live', async () => {
      const view = R.__swapView(null);
      try {
        R.noteEnvelope({ state: { slot: 1 }, companions: { owned: ['fox'], equipped: null, xp: {} } });
        assert(!R.shows('pane:stable'), 'the starter fox counted as an earned companion');
        R.noteEnvelope({ state: { slot: 1 }, companions: { owned: ['owl'], equipped: 'owl', xp: {} } });
        assert(R.shows('pane:stable'), 'an envelope companion did not open the Stable');
      } finally { R.__swapView(view); }
    });
  }),

  () => tryRunAsync('SPINE-REVEAL-8: Clan stays shut until clans are live; Party and Social open at step 10', async () => {
    const R = window.HearthriseReveal;
    const shut = Object.assign({}, R.FULL, { products: {} });
    await withPin(shut, async () => {
      assert(!R.shows('pane:clan') && !R.shows('war:clanhunt'), 'a shut product showed its door or war card');
      assert(R.shows('pane:party') && R.shows('pane:social'), 'Party / Social did not open at step 10');
      window.showTab('combat'); await tick();
      const kicks = window.HearthriseCombatScreens._destinations().map((d) => d.rid);
      assert(kicks.indexOf('war:clanhunt') < 0, 'the Clan Hunt card shows while clans are shut');
      assert(window.HearthriseNav.resolve('clan') === 'party', 'the Clan door does not open on Party');
    });
    await withPin(atStep(R, 9), async () => {
      assert(!R.shows('pane:party') && !R.shows('pane:social'), 'Party / Social opened before step 10');
    });
    const C = window.HearthriseClans;
    await withPin('live', async () => {
      assert(R.facts().products.clans === !!(C && C.clanLaunched()), 'the live product switch is not read from HearthriseClans');
    });
  }),

  () => tryRunAsync('SPINE-REVEAL-9: a door opens when its step becomes current, never earlier, and no step waits behind a shut door', async () => {
    const R = window.HearthriseReveal;
    const skip2 = atStep(R, 11);
    skip2.counts.cooked = 0;
    await withPin(skip2, async () => {
      assert(R.state().progress.current === 2, 'step 2 is not current with only it open');
      assert(!R.shows('pane:market') && !R.shows('card:vigour'), 'a later step opened its doors out of order');
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

  () => tryRunAsync('SPINE-REVEAL-10: every Go route on Home and in the Quests modal leads through an open door', async () => {
    const R = window.HearthriseReveal;
    const mid = { counts: { chopped: 20, fished: 6, cooked: 6, kills: 8, 'ev:planted': 2 }, countsComplete: true,
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

  () => tryRunAsync('SPINE-REVEAL-11: the tour names a shut door and when it opens, and spotlights only open doors', async () => {
    const R = window.HearthriseReveal, F = window.HearthriseFTUE;
    const combat = F.steps().find((s) => s.id === 'combat');
    assert(combat, 'the tour has no Combat step');
    await withPin(R.FRESH, async () => {
      assert(/^ The Combat door opens when you catch and cook five fish\.$/.test(F.shutDoorLine(combat)),
        'the tour does not say when Combat opens: ' + JSON.stringify(F.shutDoorLine(combat)));
      assert(F.findTarget(combat.target) === null, 'the tour spotlights a shut door');
      /* Drive the real tour to its Combat step: the card is centred, not left where Skills put it. */
      if (typeof window.startFTUE === 'function') {
        const KEY = 'hearthrise:ftue:completed', had = localStorage.getItem(KEY);
        window.startFTUE();
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 250));
          const t = document.querySelector('.ftue-root .ftue-title');
          if (t && t.textContent === combat.title) break;
          const nx = document.querySelector('.ftue-root [data-action="primary"]');
          if (nx) nx.click();
        }
        const card = document.querySelector('.ftue-root .ftue-card');
        try {
          assert(card && document.querySelector('.ftue-root .ftue-title').textContent === combat.title, 'could not reach the tour\'s Combat step');
          const r = card.getBoundingClientRect();
          assert(card.classList.contains('center') && card.style.left === '' && r.left >= 0 && r.right <= innerWidth,
            'the shut-door card is not centred on screen: ' + Math.round(r.left) + '..' + Math.round(r.right));
          assert(document.querySelector('.ftue-root .ftue-spot').style.display === 'none', 'a spotlight is drawn on empty space');
        } finally {
          const skip = document.querySelector('.ftue-root [data-action="skip"]');
          if (skip) skip.click();
          try { if (had === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, had); } catch (e) {}
        }
      }
    });
    await withPin(R.FULL, async () => {
      assert(F.shutDoorLine(combat) === '' && F.findTarget(combat.target), 'an open door still gets the shut-door line');
    });
  }),
];
