// ============================================================
// src/mobile.js
//
// Phone-specific UX shims that don't fit cleanly inside CSS.
//
// Currently:
//   • Hides the bottom nav while a soft keyboard is up (iOS Safari
//     overlays the keyboard on top of fixed-positioned elements,
//     so without this, the keyboard hides the input the user is
//     typing into).
//   • Adds .ios-keyboard class to <body> when an input/textarea
//     gains focus on a touch device. Removed on blur.
//   • Locks viewport units against the visualViewport API so 100vh
//     stops behaving weirdly on iOS Safari address bar collapse.
//
// Loaded last in the script chain. No dependencies.
// ============================================================

(function(){
  'use strict';

  // Touch detection — keyboard handling only matters on touch devices
  var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if(!isTouch) return;

  // ── Keyboard / focus class toggling ─────────────────────────
  function isInputLike(el){
    if(!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    if(tag === 'textarea') return true;
    if(tag === 'input'){
      var type = (el.type || 'text').toLowerCase();
      // Buttons / hidden / non-text inputs don't trigger keyboards
      return ['text','search','tel','url','email','password','number','date','time','datetime-local','month','week'].indexOf(type) !== -1;
    }
    if(el.isContentEditable) return true;
    return false;
  }
  document.addEventListener('focusin', function(e){
    if(isInputLike(e.target)) document.body.classList.add('ios-keyboard');
  });
  document.addEventListener('focusout', function(e){
    if(isInputLike(e.target)){
      // Small delay so tap-through to other inputs doesn't flicker
      setTimeout(function(){
        var ae = document.activeElement;
        if(!isInputLike(ae)) document.body.classList.remove('ios-keyboard');
      }, 80);
    }
  });

  // ── Real viewport height variable ──────────────────────────
  // Use --vh as a unit instead of vh on iOS so address-bar collapse
  // doesn't break full-height layouts. Components that need full-
  // height can write `height: calc(var(--vh, 1vh) * 100)`.
  function setVh(){
    var h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    document.documentElement.style.setProperty('--vh', (h / 100) + 'px');
  }
  setVh();
  window.addEventListener('resize', setVh);
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', setVh);
  }

  // ── Disable double-tap zoom on game UI buttons ─────────────
  // The game uses click-heavy interaction; iOS double-tap zoom
  // makes rapid clicking miserable. Apply to buttons + chips.
  var lastTap = 0;
  document.addEventListener('touchend', function(e){
    var t = e.target;
    if(!t || !t.closest) return;
    if(!t.closest('button, .chip, .bn-btn, .nav-btn, .tap')) return;
    var now = Date.now();
    if(now - lastTap < 300){ e.preventDefault(); }
    lastTap = now;
  }, { passive: false });

  console.log('[mobile] touch shims active');
})();
