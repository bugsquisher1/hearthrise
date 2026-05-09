// ============================================================
// src/beta-banner.js
//
// b141 — Beta launch prep.
//
// Shows a one-time disclaimer modal to brand-new players (anyone
// without `hearthrise:beta-ack` in localStorage), explaining:
//   • This is a beta — bugs are expected
//   • Saves are local; major schema changes may require a reset
//   • Feedback channels: Discord + in-game bug-report
//
// Closes on "I understand" → sets the ack flag → never shows again
// for that browser. Suppressed entirely when:
//   • The admin flag is on (Tyler doesn't need this)
//   • The FTUE / changelog modal is currently up (don't stack)
//   • The user has played for >5 minutes already (returning player —
//     they've effectively acknowledged by playing)
//
// Loaded as a CLASSIC <script> after legacy.js. Fires ~1.5s after
// boot so the rest of the UI has had a chance to settle.
// ============================================================

(function(){
  'use strict';

  var ACK_KEY = 'hearthrise:beta-ack';
  // Tyler — paste your real Discord invite URL here when ready.
  // Same convention as src/settings-page.js so you only update in two places.
  var DISCORD_INVITE = 'https://discord.gg/your-invite-here';

  function alreadyAcked(){
    try { return localStorage.getItem(ACK_KEY) === '1'; }
    catch (e) { return false; }
  }
  function isAdmin(){
    try { return localStorage.getItem('hearthrise:admin') === '1'; }
    catch (e) { return false; }
  }
  function modalAlreadyOpen(){
    return !!document.querySelector('.modal.show, #wbv-overlay.show, .ach-overlay.show, #ftue-overlay.show, #welcome-modal.show');
  }

  function ack(){
    try { localStorage.setItem(ACK_KEY, '1'); } catch (e) {}
    var el = document.getElementById('beta-banner-overlay');
    if(el) el.classList.remove('show');
    setTimeout(function(){ if(el && el.parentNode) el.parentNode.removeChild(el); }, 200);
  }
  window._ackBetaBanner = ack; // exposed so the close button can call it cleanly

  function show(){
    if(document.getElementById('beta-banner-overlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'beta-banner-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(8,5,3,.78);z-index:99990;'+
      'display:flex;align-items:center;justify-content:center;padding:20px;'+
      'opacity:0;transition:opacity .25s ease';
    var card = document.createElement('div');
    card.style.cssText =
      'max-width:480px;background:#fdf3d8;color:#2a1a08;border:1px solid #c9a040;'+
      'border-radius:14px;padding:22px 24px;box-shadow:0 18px 48px rgba(0,0,0,.55);'+
      'font-family:inherit;line-height:1.45';
    card.innerHTML =
      '<h2 style="margin:0 0 10px;font-size:22px">🌱 Welcome to Hearthrise</h2>'+
      '<p style="margin:0 0 12px;font-size:14px"><b>This is a beta build.</b> Things will break, balance will change, and your save may need to be reset between major updates. Thanks for playing early — your feedback shapes the game.</p>'+
      '<ul style="margin:0 0 14px;padding-left:18px;font-size:13px">'+
      '  <li>Found a bug? Use the <b>🐞 Report</b> button in the topbar — it goes straight to the dev Discord.</li>'+
      '  <li>Have ideas, want to chat, or just say hi? Join the Discord below.</li>'+
      '  <li>Saves live in your browser. Sign in via Settings → Account if you want cloud sync across devices.</li>'+
      '</ul>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">'+
      '  <a class="btn" target="_blank" rel="noopener" href="'+DISCORD_INVITE+'" style="background:#5865f2;color:white;border:none;padding:8px 14px;border-radius:6px;font-weight:700;text-decoration:none;font-size:13px">💬 Join Discord</a>'+
      '  <button class="btn btn-primary" onclick="window._ackBetaBanner()" style="background:#c9a040;color:#2a1a08;border:none;padding:8px 14px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer">I understand — let me play</button>'+
      '</div>';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(function(){ overlay.style.opacity = '1'; overlay.classList.add('show'); });
    // Esc dismisses
    var keyHandler = function(e){
      if(e.key === 'Escape'){ ack(); document.removeEventListener('keydown', keyHandler); }
    };
    document.addEventListener('keydown', keyHandler);
  }

  function maybeShow(){
    if(alreadyAcked()) return;
    if(isAdmin()) return;
    // Returning player heuristic — if they have any kills/gathered/harvested
    // already, they've been around. Don't surprise them with a banner.
    try {
      var s = window.G && window.G.stats;
      if(s && ((s.kills|0) + (s.gathered|0) + (s.harvested|0)) > 0){
        try { localStorage.setItem(ACK_KEY, '1'); } catch(_){}
        return;
      }
    } catch(_){}
    if(modalAlreadyOpen()){
      // Try again in 2s — let the other modal close first
      setTimeout(maybeShow, 2000);
      return;
    }
    show();
  }

  // Boot deferred so we don't compete with the changelog/welcome modals.
  function boot(){ setTimeout(maybeShow, 1500); }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Public API for testing + admin-side reset.
  window.HearthriseBetaBanner = {
    show: show,
    ack: ack,
    reset: function(){ try { localStorage.removeItem(ACK_KEY); } catch(_){} },
    DISCORD_INVITE: DISCORD_INVITE,
  };

  console.log('[beta-banner] loaded');
})();
