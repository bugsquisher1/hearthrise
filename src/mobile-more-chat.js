// ============================================================
// src/mobile-more-chat.js  (b110)
//
// Wires the "💬 Chat" button in the mobile More-menu sheet to
// open the chat dock fullscreen. The floating chat pill is
// hidden on mobile (CSS in theme-cozy.css), so this is the way
// players reach chat on a phone.
// ============================================================

(function(){
  'use strict';
  if (typeof document === 'undefined') return;

  function openChat() {
    // Close the More sheet first.
    const moreModal = document.getElementById('more-modal');
    if (moreModal) moreModal.classList.remove('open');

    // Force the chat dock open. window.HearthriseChat exposed by chat.js.
    try {
      if (window.HearthriseChat && typeof window.HearthriseChat.open === 'function') {
        window.HearthriseChat.open();
      } else {
        // Fallback: directly remove the .mini class
        const dock = document.getElementById('chat-dock');
        if (dock) {
          dock.classList.remove('mini');
          dock.classList.add('full');
        }
      }
    } catch (e) {
      console.warn('[mobile-more-chat] failed to open chat:', e);
    }
  }

  function wire() {
    const btn = document.getElementById('btn-chat-mobile');
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', openChat);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(wire, 200));
  } else {
    setTimeout(wire, 200);
  }
  // Re-wire if the More modal gets recreated
  setInterval(wire, 3000);
})();
