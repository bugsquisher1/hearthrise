// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/spine-reveal.js — the progressive reveal on the real screens.
//
// The headless harness pins the reveal to FULL (it has no server), so the rest
// of the suite renders a seasoned account. These tests pin the other states
// through HearthriseReveal.__pin and read what a player would see.
// ══════════════════════════════════════════════════════════════════════
import { tryRunAsync, assert, snapshotG, restoreG } from './_harness.js?v=567';

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
        const step1 = R.rows.filter((r) => r.step === 1).map((r) => r.id).sort();
        const shown = [...R.state().shown].sort();
        assert(JSON.stringify(shown) === JSON.stringify(step1),
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
];
