// ============================================================
// src/mobile-keyboard.js
//
// b108 — soft-keyboard handling on mobile browsers.
//
// When a text input or textarea is focused on a phone, iOS Safari
// (and Android Chrome to a lesser degree) shows a virtual keyboard
// that covers the bottom of the page — including the chat dock input
// the user is trying to type into.
//
// This module toggles a `body.kb-open` class on focus / blur so
// theme-cozy.css can adjust layout — bumping panel padding-bottom
// and resizing the chat dock to 50vh so the input stays above the
// keyboard. Also scrolls the focused element into view.
//
// Inert on desktop (no harm — class just toggles, the CSS rules
// are gated behind a `@media (max-width: 540px)` block).
// ============================================================

(function(){
  'use strict';
  if (typeof document === 'undefined') return;

  function isTextField(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      const t = (el.type || '').toLowerCase();
      // Exclude buttons, checkboxes, radios — they don't open keyboards
      return !['button','submit','reset','checkbox','radio','file','color','range','image'].includes(t);
    }
    return el.isContentEditable;
  }

  function onFocusIn(e) {
    if (!isTextField(e.target)) return;
    document.body.classList.add('kb-open');
    // Give the keyboard a beat to start animating in, then scroll the
    // focused field into view above it.
    setTimeout(function(){
      try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) {}
    }, 120);
  }

  function onFocusOut(e) {
    if (!isTextField(e.target)) return;
    // Tab-key / programmatic-focus chains shouldn't flash the layout —
    // wait a tick and only collapse if no other text field is focused.
    setTimeout(function(){
      if (!isTextField(document.activeElement)) {
        document.body.classList.remove('kb-open');
      }
    }, 120);
  }

  document.addEventListener('focusin',  onFocusIn,  true);
  document.addEventListener('focusout', onFocusOut, true);

  // visualViewport API (newer browsers) gives us a more accurate signal
  // for how much of the screen the keyboard is covering. Use it when
  // available to correct any blur/focus race.
  if (window.visualViewport) {
    let last = window.visualViewport.height;
    window.visualViewport.addEventListener('resize', function(){
      const now = window.visualViewport.height;
      // If viewport shrank by more than 150px and we have a text field
      // focused, it's the keyboard. If it grew back, keyboard closed.
      const diff = last - now;
      last = now;
      if (Math.abs(diff) < 100) return;
      if (diff > 100 && isTextField(document.activeElement)) {
        document.body.classList.add('kb-open');
      } else if (diff < -100) {
        document.body.classList.remove('kb-open');
      }
    });
  }

  console.log('[mobile-keyboard] soft-keyboard handler armed');
})();
