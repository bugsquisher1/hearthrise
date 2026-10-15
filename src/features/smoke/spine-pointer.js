// ══════════════════════════════════════════════════════════════════════
// src/features/smoke/spine-pointer.js — the one pointer, played.
//
// The bar (every tab but Home), Home's step card, the daily chip and the
// unlock moment, driven through HearthriseReveal.__pin (the server's facts)
// and read off the real DOM. Every claim is stubbed: the suite runs on a live
// signed-in account during the play gate and must never pay a real quest.
// ══════════════════════════════════════════════════════════════════════
import { tryRun, tryRunAsync, assert, snapshotG, restoreG } from './_harness.js?v=584';

const BASE = { counts: {}, countsComplete: true, skills: {}, property: 0, workers: 0, bag: {}, gold: 0, equipment: {}, claimed: {} };
const FIRST4 = { chopped: 15, fished: 5, 'ev:cooked': 5, 'ev:kill_any': 5, 'ev:planted': 1 };
/* The first-day rewards, already paid: a fixture past a step is past its Claim. */
const PAID = { gatherer: true, first_cook: true, first_blood: true, farmhand: true };
const facts = (o) => Object.assign({}, BASE, { claimed: PAID }, o);
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Pin the facts, draw the bar on `tab`, hand the body the bar and the model. */
async function onBar(f, body, tab) {
  const R = window.HearthriseReveal, SP = window.HearthriseSpine;
  const snap = snapshotG();
  const was = R.__pin(f);
  try {
    window.showTab(tab || 'skills');
    SP.__forget(); SP.render();
    return await body(document.getElementById('hr-spine-bar'), SP);
  } finally { R.__pin(was); SP.__forget(); restoreG(snap); window.showTab('profile'); }
}
const text = (bar) => [...bar.querySelectorAll('.sp-step, .sp-title, .sp-part, .sp-reward, .sp-go')]
  .map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' ');

export default [

  /* -- player actions -- a fresh character is on step 1; Go lands where logs
     are chopped; the server's count of 15 moves the bar to step 2. */
  () => tryRunAsync('SPINE-POINTER-1: a fresh character is on step 1, Go opens Woodcutting, and a server fact advances the bar', async () => {
    const SP = window.HearthriseSpine;
    assert(SP && typeof SP.model === 'function', 'window.HearthriseSpine is not published');
    await onBar(facts({ claimed: {} }), async (bar) => {
      assert(bar && !bar.hidden, 'the pointer bar is not drawn on Skills');
      assert(/^Step 1 Chop 15 logs/.test(text(bar)) && /Logs chopped 0\/15/.test(text(bar)), 'fresh bar: ' + text(bar));
      const go = bar.querySelector('.sp-go');
      assert(go && go.textContent === 'Go chop', 'the button reads ' + (go && go.textContent));
      window.showTab('combat');
      go.click();
      assert(document.getElementById('panel-skills').classList.contains('active'), 'Go chop did not open Skills');
    });
    await onBar(facts({ counts: { chopped: 15 } }), async (bar) => {
      assert(/^Step 2 Catch and cook 5 fish/.test(text(bar)), 'chopped 15 did not move the bar to step 2: ' + text(bar));
      assert(bar.querySelector('.sp-go').textContent === 'Go fish', 'step 2 must send the player fishing first');
    });
  }),

  /* -- regression suite -- the browser saying "done" moves nothing. */
  () => tryRunAsync('SPINE-POINTER-2: a client "done" with a server count of 0 does not advance the bar', async () => {
    const R = window.HearthriseReveal;
    await onBar('live', async (bar, SP) => {
      const view = R.__swapView({ counts: {}, countsComplete: true, property: 0, workers: 0, bag: {}, claimed: {} });
      try {
        const G = window.G;
        window.ensureRetentionState();
        G.quests.forEach((q) => { q.done = true; q.claimed = true; q.progress = q.goal; });
        G.stats = Object.assign({}, G.stats, { chopped: 999, kills: 999, gathered: 999 });
        SP.__forget(); SP.render();
        assert(SP.model().step === 1 && /^Step 1/.test(text(bar)), 'client-written quests or stats moved the pointer: ' + text(bar));
        assert(bar.querySelector('.sp-go').textContent === 'Go chop', 'the bar offered ' + bar.querySelector('.sp-go').textContent);
      } finally { R.__swapView(view); }
    });
  }),

  () => tryRunAsync('SPINE-POINTER-3: an unknown fact shows the pending dash, and an unread record shows no step at all', async () => {
    await onBar(facts({ counts: FIRST4, bag: null, gold: null }), async (bar) => {
      assert(/^Step 5 Build the Homestead/.test(text(bar)), 'expected the Homestead step: ' + text(bar));
      const parts = [...bar.querySelectorAll('.sp-part')];
      assert(parts.length === 3 && parts.every((p) => p.querySelector('.bal-pending') && /\/\d/.test(p.textContent)),
        'every unknown cost must read the dash over its goal: ' + parts.map((p) => p.textContent).join(' | '));
      assert(!/ 0\/\d/.test(text(bar)), 'an unknown count was drawn as 0: ' + text(bar));
    });
    await onBar(facts({ countsComplete: false }), async (bar) => {
      assert(/Finding your next step/.test(text(bar)) && !bar.querySelector('.sp-go') && !/Step 1/.test(text(bar)),
        'before the server has counted, the bar must not claim a step: ' + text(bar));
    });
  }),

  /* -- player actions -- a finished step whose server reward waits reads
     Claim; the claim goes through hr_claim_quest (stubbed) and the bar moves on. */
  () => tryRunAsync('SPINE-POINTER-4: a finished step with its reward unpaid reads Claim, claims through hr_claim_quest, then moves on', async () => {
    const GC = window.HearthriseGoalClaim, note = window.notify, calls = [];
    try {
      window.notify = () => {};
      window.HearthriseGoalClaim = { isSignedIn: () => true, claimQuest: (id) => { calls.push(id); return Promise.resolve({ ok: true, credited: true, quest: id, gold: 150, items: {} }); } };
      await onBar(facts({ counts: { chopped: 15, 'ev:gather': 15 }, claimed: {} }), async (bar, SP) => {
        assert(/^Step 1/.test(text(bar)) && /150 gold/.test(text(bar)), 'the step and its catalogue reward: ' + text(bar));
        const btn = bar.querySelector('.sp-go');
        assert(btn && btn.textContent === 'Claim', 'the button reads ' + (btn && btn.textContent));
        btn.click();
        await tick(); await tick();
        assert(calls.length === 1 && calls[0] === 'gatherer', 'Claim must fire hr_claim_quest for gatherer once: ' + JSON.stringify(calls));
        SP.render();
        assert(/^Step 2/.test(text(bar)), 'a paid claim left the bar on step 1: ' + text(bar));
      });
      await onBar(facts({ counts: FIRST4, bag: {}, gold: 0 }), async (bar) => {
        assert(!/gold ·|Claim/.test(text(bar)) && !bar.querySelector('.sp-reward'), 'a step with no server reward showed one: ' + text(bar));
      });
    } finally { window.HearthriseGoalClaim = GC; window.notify = note; }
  }),

  () => tryRunAsync('SPINE-POINTER-5: "Your first day", the Journeyman\'s Road card, "Next up" and the quest strip are gone; Home leads with the step', async () => {
    const H = window.HearthriseHome;
    assert(H && !H.__firstDayModel && !H.__roadModel && !H.__firstDayHtml, 'a retired Home card still publishes its seam');
    await onBar(facts({ counts: FIRST4, bag: { normal_log: 30, copper_ore: 4 }, gold: 100 }), async (bar) => {
      assert(!document.getElementById('global-quests-strip'), 'the quest strip is still drawn');
      window.showTab('profile'); H.render(); window.HearthriseSpine.render();
      assert(bar.hidden, 'the bar must step aside on Home, where the card carries the step');
      const root = document.getElementById('hd-root');
      const words = root.textContent;
      assert(!/Your first day|Journeyman|Next up/.test(words), 'a retired list is still on Home: ' + (words.match(/Your first day|Journeyman[^.]*|Next up/) || [''])[0]);
      const card = root.querySelector('[data-sp-card]');
      assert(card && card === root.querySelector('.hd-col').firstElementChild, 'Home does not lead its first column with the step card');
      assert(/Step 5/.test(card.textContent) && /Build the Homestead/.test(card.textContent) && /more farm plots/.test(card.textContent),
        'the card must carry the step and its reason: ' + card.textContent);
      assert(card.querySelector('[data-sp="go"]').textContent === 'Go mine', 'the card button must match the bar');
      assert(/Next: Hire your first hand/.test(card.textContent) && !/Step \d+ of \d+/.test(card.textContent + bar.textContent),
        'the card must name the next rung and no step may claim a finish line: ' + card.textContent);
    }, 'profile');
  }),


  /* The wear-the-boots rung left the spine with the 2026-10-14 demolition; step 7
     is the first craft, and step 8 the first harvest. */
  () => tryRunAsync('SPINE-POINTER-7: step 7 waits for the first craft; the unlock moment speaks once per newly finished step', async () => {
    const six = Object.assign({}, FIRST4, { crafted: 1 });
    await onBar(facts({ counts: FIRST4, property: 1, workers: 1 }), async (bar) => {
      assert(/^Step 7/.test(text(bar)) && /Craft your first item/.test(text(bar)), 'step 7 is not the first craft: ' + text(bar));
    });
    await onBar(facts({ counts: six, property: 1, workers: 1 }), async (bar) => {
      assert(/^Step 8/.test(text(bar)), 'a first craft did not finish step 7: ' + text(bar));
    });
    const SP = window.HearthriseSpine;
    const was = SP.__park(true);
    try {
      SP.__forget();
      assert(SP.observe('t:1', ['chop_logs']).length === 0, 'the first reading must be a silent baseline');
      assert(SP.observe('t:1', ['chop_logs', 'fish_and_cook']).join() === 'fish_and_cook', 'a newly finished step must speak');
      assert(SP.observe('t:1', ['chop_logs', 'fish_and_cook']).length === 0, 'a step must speak only once');
      assert(SP.observe('t:2', ['chop_logs', 'fish_and_cook']).length === 0, 'another slot starts a fresh baseline');
      const el = SP.showMoment('first_craft');
      assert(el && /Sell your surplus on the Player Market/.test(el.textContent) && !/Market opens/.test(el.textContent), 'the moment reads ' + (el && el.textContent));
      el.remove();
    } finally { SP.__park(was); SP.__forget(); }
  }),
];
