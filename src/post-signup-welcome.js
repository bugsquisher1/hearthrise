// ============================================================
// src/post-signup-welcome.js
//
// First-time-after-signup welcome flow. Fires ONCE for a player
// who:
//   • Has a valid Supabase session, AND
//   • Hasn't seen this welcome before (localStorage flag).
//
// Tells them their name, gives them a single clear CTA: "Train
// your first skill →" which jumps to Activities. Optional dismiss.
//
// Why this exists: previously, after email confirmation, the
// player landed back on the Profile sheet with no guidance about
// what to do next. They'd wander tabs aimlessly. This is the
// minimum viable "what to do first" prompt.
// ============================================================

(function(){
  'use strict';
  const SEEN_KEY = 'hearthrise:post-signup-welcome:seen';

  function show(displayName) {
    if (document.getElementById('hr-post-signup-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'hr-post-signup-modal';
    overlay.style.cssText = ''
      + 'position:fixed;inset:0;background:rgba(40,25,12,.55);'
      + 'z-index:99996;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = ''
      + '<div style="background:linear-gradient(180deg,#fff8e2,#f4e4bc);'
      + 'border:2px solid #b8893e;border-radius:8px;padding:24px;'
      + 'max-width:440px;width:100%;color:#3d2817;'
      + "font-family:'Quicksand',system-ui,sans-serif;"
      + 'box-shadow:0 8px 24px rgba(60,40,16,.4)">'
      +   '<div style="text-align:center">'
      +     "<div style=\"font-family:'Cinzel',serif;font-size:11px;letter-spacing:.22em;color:#7a4623;margin-bottom:6px;text-transform:uppercase\">Welcome, traveler</div>"
      +     "<h2 style=\"font-family:'Cinzel',serif;color:#5c2d08;font-size:24px;letter-spacing:.04em;margin:0 0 14px\">"
      +       (displayName ? esc(displayName) : 'Adventurer')
      +     '</h2>'
      +     '<p style="margin:0 0 12px;font-size:14px;line-height:1.55">Your save is now syncing to the cloud — pick up on any device any time.</p>'
      +     '<p style="margin:0 0 18px;font-size:14px;line-height:1.55"><b>First step:</b> head to <b>Activities</b> and start training a skill. Every action earns XP, even while you\'re away.</p>'
      +     '<div style="display:flex;gap:8px;justify-content:center">'
      +       '<button id="hr-psw-go" style="'
      +         'background:linear-gradient(180deg,#d44a3a,#8b2a1f);color:#fff8e2;'
      +         'border:2px solid #5a1208;border-radius:4px;'
      +         "font-family:'Cinzel',serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;"
      +         'padding:10px 20px;cursor:pointer;'
      +         'box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 2px 4px rgba(60,40,16,.3)">'
      +         'Train your first skill →'
      +       '</button>'
      +       '<button id="hr-psw-close" style="'
      +         'background:rgba(255,247,224,.7);color:#3d2817;'
      +         'border:1px solid #b8893e;border-radius:4px;'
      +         "font-family:'Cinzel',serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;"
      +         'padding:10px 16px;cursor:pointer">'
      +         'Look around first'
      +       '</button>'
      +     '</div>'
      +   '</div>'
      + '</div>';
    function close(){ overlay.remove(); }
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#hr-psw-close').addEventListener('click', close);
    overlay.querySelector('#hr-psw-go').addEventListener('click', () => {
      close();
      if (typeof window.showTab === 'function') window.showTab('skills');
    });
    document.body.appendChild(overlay);
  }
  function esc(s){
    return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }
  function seen(){ try { return !!localStorage.getItem(SEEN_KEY); } catch { return false; } }
  function markSeen(){ try { localStorage.setItem(SEEN_KEY, '1'); } catch {} }

  function maybeShow() {
    if (seen()) return;
    const session = window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession();
    if (!session || !session.user) return;
    // Don't stack on FTUE
    if (document.querySelector('.hr-ftue, .hr-ftue-overlay')) {
      setTimeout(maybeShow, 2000);
      return;
    }
    // Resolve display name from a few sources, fall back to email prefix
    let name = (window.G && window.G.playerName) || '';
    if (!name || name === 'Adventurer') {
      name = session.user.user_metadata?.display_name
          || (session.user.email && session.user.email.split('@')[0])
          || 'Adventurer';
    }
    show(name);
    markSeen();
  }

  // Watch for sign-in via the Supabase auth state change. We can't
  // hook directly, but we can poll briefly for a session.
  function bootWatch() {
    let tries = 0;
    const tick = setInterval(() => {
      tries++;
      const session = window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession();
      if (session && session.user) {
        clearInterval(tick);
        setTimeout(maybeShow, 500);
      }
      if (tries > 30) clearInterval(tick); // give up after ~30s
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootWatch);
  } else {
    bootWatch();
  }

  // Public hook: manual trigger from settings ("show welcome again")
  window.HearthrisePostSignup = {
    show: () => { try { localStorage.removeItem(SEEN_KEY); } catch {}; maybeShow(); },
    seen,
  };
})();
