// ============================================================
// src/ftue.js
//
// First-time-user-experience (FTUE) — a six-step guided tour
// shown to new players the first time they load the game.
//
// Triggers:
//   • No `hearthrise:ftue:completed` flag in localStorage AND
//   • The save is essentially fresh (total skill XP near zero)
//
// Behaviour:
//   • Spotlight overlay darkens the page, leaving a bright window
//     around the target element.
//   • Floating card anchored near the spotlight with title, copy,
//     and Next / Skip buttons.
//   • Skip button is always visible — never hostage-tutorial.
//   • Auto-advances when the player clicks the highlighted tab
//     (gives them the credit for following along).
//   • Pressing Esc skips the tour.
//   • On reload the player sees nothing (flag persisted forever
//     unless they call window.resetFTUE() from devtools).
//
// Architecture:
//   • Self-contained IIFE. No external CSS — styles inlined into
//     a <style> block that lives only while the tour is active.
//   • DOM additions are removed when the tour ends, so there's
//     zero footprint on returning players.
//   • Boots after DOMContentLoaded + a 600ms delay so legacy.js
//     has time to render the sidebar / topbar / panels we point at.
//
// Devtools API:
//   window.startFTUE()    — force the tour to run (ignores flag)
//   window.resetFTUE()    — clear the completed flag
//   window.endFTUE(true)  — skip immediately and mark complete
// ============================================================

(function(){
  'use strict';

  var FTUE_KEY = 'hearthrise:ftue:completed';
  var STEP_DELAY_MS = 600;   // delay before showing first step (lets DOM settle)

  // ── Step definitions ────────────────────────────────────────
  // Each step targets a CSS selector; if the element doesn't exist
  // we silently skip the step rather than crash. `body` is the
  // implicit fallback for the welcome / wrap-up cards.
  var STEPS = [
    {
      id: 'welcome',
      target: 'body',                     // centered modal — no spotlight
      placement: 'center',
      title: 'Welcome to Hearthrise',
      body: 'A cozy idle RPG where you train skills, fight monsters, and build a homestead. Want a quick 60-second tour of the basics?',
      primary: 'Take the tour',
      secondary: 'Skip — I know what I\'m doing',
      onSecondary: function(){ endFTUE(true); },
    },
    {
      id: 'topbar',
      target: '.top-stats',
      placement: 'below',
      title: 'Your stats live up here',
      body: 'Combat level, total level, gold, and gems. Tap the 💾 anytime to save — though we auto-save in the background too.',
      primary: 'Got it',
    },
    {
      id: 'skills',
      target: 'button[data-tab="skills"]',
      placement: 'right',
      title: 'Train skills here',
      body: 'Activities like Woodcutting, Mining, Fishing, and Cooking earn XP and produce items. Pick one and let it run — even when you\'re offline, progress continues.',
      primary: 'Next',
      autoAdvanceOnClick: true,
    },
    {
      id: 'combat',
      target: 'button[data-tab="combat"]',
      placement: 'right',
      title: 'Fight monsters for loot',
      body: 'Combat drops materials for crafting, gold, and rare gear. Remember to equip a weapon (Inventory → Equipment) and bring food before the bigger fights.',
      primary: 'Next',
      autoAdvanceOnClick: true,
    },
    {
      id: 'inventory',
      target: 'button[data-tab="inventory"]',
      placement: 'right',
      title: 'Your items live here',
      body: 'Drag items onto the equipment doll to wear them. Right-click any item to equip, eat, bury bones, inspect, or sell. Hover to compare gear vs what you have on.',
      primary: 'Next',
      autoAdvanceOnClick: true,
    },
    {
      id: 'wrap',
      target: 'body',
      placement: 'center',
      title: 'You\'re ready',
      body: 'Train any skill, kill anything that moves, and check back tomorrow for offline rewards. Good luck out there.',
      primary: 'Start playing',
      onPrimary: function(){ endFTUE(true); },
    },
  ];

  // ── State ──────────────────────────────────────────────────
  var stepIndex = 0;
  var rootEl    = null;
  var styleEl   = null;
  var resizeRaf = null;

  // ── Eligibility ─────────────────────────────────────────────
  // We only show the tour to genuinely new players. A player is
  // "new" if they have no completed-flag AND their save doesn't
  // already show meaningful progress.
  function isNewPlayer(){
    try {
      if(localStorage.getItem(FTUE_KEY) === '1') return false;
    } catch(e){ return false; }
    var G = window.G;
    if(!G || !G.skills) return true;       // brand new save — show tour
    // Sum of trained skills (excluding hp baseline)
    var totalXp = 0;
    Object.keys(G.skills).forEach(function(k){
      if(k === 'hitpoints') return;        // hitpoints starts non-zero
      totalXp += (G.skills[k] || 0);
    });
    return totalXp < 100;                  // ~< 1 minute of training
  }

  // ── Style injection ─────────────────────────────────────────
  function injectStyles(){
    if(styleEl) return;
    styleEl = document.createElement('style');
    styleEl.id = 'ftue-styles';
    styleEl.textContent = ''
      + '.ftue-root{position:fixed;inset:0;z-index:99999;pointer-events:none;font-family:inherit}'
      + '.ftue-shade{position:absolute;inset:0;background:rgba(8,12,18,0.62);transition:opacity 250ms ease;opacity:0;pointer-events:auto}'
      + '.ftue-shade.show{opacity:1}'
      + '.ftue-spot{position:absolute;border-radius:14px;box-shadow:0 0 0 9999px rgba(8,12,18,0.62), 0 0 0 3px rgba(255,210,120,0.85), 0 0 32px rgba(255,210,120,0.55);transition:all 250ms ease;pointer-events:none}'
      + '.ftue-card{position:absolute;max-width:340px;background:linear-gradient(180deg,#1d2531,#171d27);color:#e8eaef;border:1px solid #3a4555;border-radius:12px;padding:14px 16px 12px;box-shadow:0 18px 48px rgba(0,0,0,0.55),0 2px 8px rgba(0,0,0,0.4);pointer-events:auto;opacity:0;transform:translateY(8px) scale(0.98);transition:opacity 220ms ease,transform 220ms ease}'
      + '.ftue-card.show{opacity:1;transform:translateY(0) scale(1)}'
      + '.ftue-card.center{left:50%;top:50%;transform:translate(-50%,calc(-50% + 8px))}'
      + '.ftue-card.center.show{transform:translate(-50%,-50%)}'
      + '.ftue-pip{position:absolute;width:0;height:0;border:8px solid transparent}'
      + '.ftue-card[data-pip="below"] .ftue-pip{top:-16px;left:24px;border-bottom-color:#1d2531}'
      + '.ftue-card[data-pip="above"] .ftue-pip{bottom:-16px;left:24px;border-top-color:#171d27}'
      + '.ftue-card[data-pip="right"] .ftue-pip{left:-16px;top:24px;border-right-color:#1d2531}'
      + '.ftue-card[data-pip="left"]  .ftue-pip{right:-16px;top:24px;border-left-color:#171d27}'
      + '.ftue-step{font-size:11px;color:#a4adba;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:4px}'
      + '.ftue-title{font-size:16px;font-weight:700;color:#fff;margin:0 0 6px}'
      + '.ftue-body{font-size:13.5px;line-height:1.45;color:#cfd5de;margin:0 0 12px}'
      + '.ftue-actions{display:flex;gap:8px;justify-content:flex-end;align-items:center}'
      + '.ftue-btn{font:inherit;font-size:13px;padding:7px 14px;border-radius:8px;border:1px solid #4a5667;background:#2a3340;color:#e8eaef;cursor:pointer;transition:background 120ms ease,transform 80ms ease}'
      + '.ftue-btn:hover{background:#37414f}'
      + '.ftue-btn:active{transform:translateY(1px)}'
      + '.ftue-btn.primary{background:linear-gradient(180deg,#f0b860,#d99c40);color:#1a1610;border-color:#b88533;font-weight:600}'
      + '.ftue-btn.primary:hover{background:linear-gradient(180deg,#f5c570,#e0a44a)}'
      + '.ftue-btn.skip{background:transparent;border-color:transparent;color:#8a92a0;padding:7px 8px}'
      + '.ftue-btn.skip:hover{background:#2a3340;color:#cfd5de}'
      + '@media (max-width: 540px){'
      +   '.ftue-card{max-width:calc(100vw - 32px);left:16px !important;right:16px;width:auto}'
      +   '.ftue-card.center{left:50% !important;right:auto;width:auto;max-width:calc(100vw - 32px)}'
      + '}';
    document.head.appendChild(styleEl);
  }

  // ── Build root once ─────────────────────────────────────────
  function buildRoot(){
    if(rootEl) return;
    rootEl = document.createElement('div');
    rootEl.className = 'ftue-root';
    rootEl.innerHTML = ''
      + '<div class="ftue-shade"></div>'
      + '<div class="ftue-spot" style="display:none"></div>'
      + '<div class="ftue-card"><span class="ftue-pip"></span>'
      +   '<div class="ftue-step"></div>'
      +   '<h3 class="ftue-title"></h3>'
      +   '<p class="ftue-body"></p>'
      +   '<div class="ftue-actions">'
      +     '<button class="ftue-btn skip" data-action="skip">Skip tutorial</button>'
      +     '<button class="ftue-btn" data-action="secondary" style="display:none"></button>'
      +     '<button class="ftue-btn primary" data-action="primary"></button>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(rootEl);

    rootEl.querySelector('[data-action="skip"]').addEventListener('click', function(){ endFTUE(true); });
    rootEl.querySelector('[data-action="primary"]').addEventListener('click', function(){
      var s = STEPS[stepIndex];
      if(s && typeof s.onPrimary === 'function'){ s.onPrimary(); return; }
      next();
    });
    rootEl.querySelector('[data-action="secondary"]').addEventListener('click', function(){
      var s = STEPS[stepIndex];
      if(s && typeof s.onSecondary === 'function'){ s.onSecondary(); return; }
    });

    document.addEventListener('keydown', escListener, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
  }

  function escListener(e){
    if(e.key === 'Escape' && rootEl && rootEl.parentNode) endFTUE(true);
  }
  function onResize(){
    if(resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(positionCurrent);
  }

  // ── Step rendering ──────────────────────────────────────────
  function renderStep(){
    var step = STEPS[stepIndex];
    if(!step){ endFTUE(true); return; }
    var card = rootEl.querySelector('.ftue-card');
    var spot = rootEl.querySelector('.ftue-spot');

    rootEl.querySelector('.ftue-step').textContent = 'Step ' + (stepIndex + 1) + ' of ' + STEPS.length;
    rootEl.querySelector('.ftue-title').textContent = step.title;
    rootEl.querySelector('.ftue-body').textContent  = step.body;

    var primaryBtn   = rootEl.querySelector('[data-action="primary"]');
    var secondaryBtn = rootEl.querySelector('[data-action="secondary"]');
    var skipBtn      = rootEl.querySelector('[data-action="skip"]');
    primaryBtn.textContent   = step.primary || 'Next';
    if(step.secondary){
      secondaryBtn.textContent = step.secondary;
      secondaryBtn.style.display = '';
      // When a step provides its own secondary (skip-style) action,
      // hide the always-visible "Skip tutorial" pill so we don't
      // present two redundant skip choices on the same card.
      if(skipBtn) skipBtn.style.display = 'none';
    } else {
      secondaryBtn.style.display = 'none';
      if(skipBtn) skipBtn.style.display = '';
    }

    // Reveal
    setTimeout(function(){
      rootEl.querySelector('.ftue-shade').classList.add('show');
      card.classList.add('show');
    }, 30);

    // Spotlight + position card
    positionCurrent();

    // Auto-advance hook: clicking the highlighted tab counts as
    // following along, no need for the user to also press Next.
    if(step.autoAdvanceOnClick && step.target){
      var tgt = document.querySelector(step.target);
      if(tgt){
        var handler = function(){
          tgt.removeEventListener('click', handler, true);
          // Small delay so the panel they navigated to has time to render
          setTimeout(next, 220);
        };
        tgt.addEventListener('click', handler, true);
      }
    }
  }

  function positionCurrent(){
    var step = STEPS[stepIndex];
    if(!step || !rootEl) return;
    var card = rootEl.querySelector('.ftue-card');
    var spot = rootEl.querySelector('.ftue-spot');

    if(step.placement === 'center' || step.target === 'body' || !step.target){
      spot.style.display = 'none';
      card.classList.add('center');
      card.style.left = ''; card.style.top = ''; card.style.right = '';
      card.removeAttribute('data-pip');
      // Hide the directional pip on centered cards
      var pip = card.querySelector('.ftue-pip');
      if(pip) pip.style.display = 'none';
      return;
    }

    var tgt = document.querySelector(step.target);
    if(!tgt){
      // Target missing — fall back to centered card
      spot.style.display = 'none';
      card.classList.add('center');
      return;
    }
    card.classList.remove('center');
    var pip = card.querySelector('.ftue-pip');
    if(pip) pip.style.display = '';

    var rect = tgt.getBoundingClientRect();
    var pad = 6;
    spot.style.display = 'block';
    spot.style.left   = (rect.left - pad) + 'px';
    spot.style.top    = (rect.top  - pad) + 'px';
    spot.style.width  = (rect.width  + pad*2) + 'px';
    spot.style.height = (rect.height + pad*2) + 'px';

    // Place card based on requested placement, fall back to viewport edges
    var place = step.placement || 'right';
    var cw = card.offsetWidth || 320;
    var ch = card.offsetHeight || 140;
    var vw = window.innerWidth, vh = window.innerHeight;
    var x = 0, y = 0, pipDir = place;

    if(place === 'right'){
      x = rect.right + 18;  y = rect.top;
      if(x + cw > vw - 12){ place = 'left'; pipDir = 'left'; x = rect.left - cw - 18; }
    } else if(place === 'left'){
      x = rect.left - cw - 18;  y = rect.top;
      if(x < 12){ place = 'right'; pipDir = 'right'; x = rect.right + 18; }
    } else if(place === 'below'){
      x = rect.left;  y = rect.bottom + 18;
      if(y + ch > vh - 12){ place = 'above'; pipDir = 'above'; y = rect.top - ch - 18; }
    } else if(place === 'above'){
      x = rect.left;  y = rect.top - ch - 18;
      if(y < 12){ place = 'below'; pipDir = 'below'; y = rect.bottom + 18; }
    }
    // Clamp to viewport
    x = Math.max(12, Math.min(x, vw - cw - 12));
    y = Math.max(12, Math.min(y, vh - ch - 12));
    card.style.left = x + 'px';
    card.style.top  = y + 'px';
    card.setAttribute('data-pip', pipDir);
  }

  function next(){
    var card = rootEl.querySelector('.ftue-card');
    card.classList.remove('show');
    setTimeout(function(){
      stepIndex++;
      if(stepIndex >= STEPS.length){ endFTUE(true); return; }
      renderStep();
    }, 200);
  }

  // ── Public lifecycle ────────────────────────────────────────
  function startFTUE(){
    injectStyles();
    buildRoot();
    stepIndex = 0;
    if(typeof window.trackEvent === 'function') window.trackEvent('ftue_start', {});
    setTimeout(renderStep, 50);
  }

  function endFTUE(markComplete){
    if(rootEl){
      var card = rootEl.querySelector('.ftue-card');
      var shade = rootEl.querySelector('.ftue-shade');
      if(card)  card.classList.remove('show');
      if(shade) shade.classList.remove('show');
      setTimeout(function(){
        if(rootEl && rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
        if(styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        rootEl = null; styleEl = null;
      }, 280);
    }
    document.removeEventListener('keydown', escListener, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onResize, true);
    if(markComplete){
      try { localStorage.setItem(FTUE_KEY, '1'); } catch(e){}
      if(typeof window.trackEvent === 'function') window.trackEvent('ftue_complete', { stoppedAt: stepIndex });
    }
  }

  // ── Devtools API ────────────────────────────────────────────
  window.startFTUE = startFTUE;
  window.endFTUE   = endFTUE;
  window.resetFTUE = function(){
    try { localStorage.removeItem(FTUE_KEY); } catch(e){}
    console.log('[ftue] reset — refresh the page to see the tour again');
  };

  // ── Auto-boot ───────────────────────────────────────────────
  function maybeStart(){
    if(!isNewPlayer()) return;
    setTimeout(startFTUE, STEP_DELAY_MS);
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', maybeStart);
  } else {
    maybeStart();
  }

  console.log('[ftue] loaded — call window.startFTUE() to preview, window.resetFTUE() to clear');
})();
