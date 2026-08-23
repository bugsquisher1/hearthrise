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
  var DISCORD_INVITE = 'https://discord.gg/eJrUSUJM3M';

  function alreadyAcked(){
    try { return localStorage.getItem(ACK_KEY) === '1'; }
    catch (e) { return false; }
  }
  function isAdmin(){
    try { return localStorage.getItem('hearthrise:admin') === '1'; }
    catch (e) { return false; }
  }
  // Every selector that means "a modal owns the screen right now". A miss here
  // does not fail loudly — it just draws this card on top of another one — so
  // it is a LIST that must be kept true, and it is published (below) so a test
  // can hold it against the DOM the game actually builds.
  //
  // b342: `#welcome-modal.show` never matched anything. The welcome-back modal
  // legacy.js builds is `<div id="welcome-overlay" class="welcome-overlay">`
  // with an INNER `.welcome-modal` — so the selector had the right word in the
  // wrong position (id vs class) and the wrong element (the inner card never
  // takes `.show`; the overlay does). Result, measured: "Welcome back,
  // adventurer" with "This is a beta build" drawn on top of it and `Continue`
  // peeking out below. Both real ids are listed now, and the retry that was
  // already here (`setTimeout(maybeShow, 2000)`) turns the collision into a
  // QUEUE — the banner waits its turn instead of racing.
  var BLOCKING_MODALS = [
    '.modal.show',
    '#welcome-overlay.show',      // legacy.js maybeShowWelcome()
    '#wbv-overlay.show',          // legacy.js welcome-v2
    /* daily-reward.js has no `.show` state at all — the scrim IS the modal and
       it is removed on dismiss, so PRESENCE is the condition. A `.show` here
       would have been a third selector that matches nothing. */
    '#hr-dl-modal',
    '.ach-overlay.show',
    '.ftue-shade.show',
    '.ftue-card.show'
  ].join(', ');
  function modalAlreadyOpen(){
    return !!document.querySelector(BLOCKING_MODALS);
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
    /* b219: was a hardcoded cream card (#fdf3d8 on #2a1a08) left over from the
       retired cozy-light theme, so the first thing a new player saw under
       Hearthlight was a bright parchment rectangle in an otherwise dark game.
       Colours now come from theme tokens, per the no-hardcoded-colour rule. */
    card.style.cssText =
      'max-width:480px;background:linear-gradient(180deg,var(--bg-2,#262019),var(--bg-1,#16120d));'+
      'color:var(--ink,#ece1cc);border:1px solid var(--line-strong,rgba(201,162,74,.55));'+
      'border-radius:var(--r-lg,5px);padding:22px 24px;box-shadow:0 18px 48px rgba(0,0,0,.55);'+
      'font-family:inherit;line-height:1.45';
    /* b219 (backlog #12/Art Director): the copy rendered literal emoji
       (a seedling in the heading, a ladybug for the bug button, a speech
       balloon on the Discord link). Emoji-as-art is banned project-wide —
       and the button it was pointing at hasn't used an emoji since b213, so
       the ladybug was also just wrong. Plain words + the game's own line-art
       glyph carry it instead. */
    card.innerHTML =
      '<h2 style="margin:0 0 10px;font-size:var(--t-h2,22px);font-family:var(--f-display,inherit);color:var(--gold-2,#f3d181)">Welcome to Hearthrise</h2>'+
      /* b46x — OPEN BETA. This card is shown to a player who has ALREADY made
         an account (it boots behind the gate), so it carries the half of the
         open-beta line that still applies to them: it is rough, tell us. The
         "make an account and play" half belongs on the account wall, where
         there is an account to make. */
      '<p style="margin:0 0 12px;font-size:var(--t-small,14px)"><b>Hearthrise is in open beta.</b> It\'s rough in places — things will break, balance will change, and your save may need to be reset between major updates. Tell us in Discord; your feedback shapes the game.</p>'+
      '<ul style="margin:0 0 14px;padding-left:18px;font-size:var(--t-small,14px)">'+
      '  <li>Found a bug? Use the <b>Report</b> button in the bottom-right corner — it goes straight to the dev Discord.</li>'+
      '  <li>Have ideas, want to chat, or just say hi? Join the Discord below.</li>'+
      /* b224: this line used to read "Saves live in your browser. Sign in via
         Settings → Account if you want cloud sync" — an invitation to play
         without an account, which is no longer the product. Accounts are
         required; the local save is the offline cache underneath one. */
      '  <li>Your account keeps your progress safe — it syncs to the realm and follows you to every device you play on.</li>'+
      '</ul>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">'+
      '  <a class="btn" target="_blank" rel="noopener" href="'+DISCORD_INVITE+'" style="background:transparent;color:var(--ink-2,#c4b79e);border:1px solid var(--line,rgba(201,162,74,.3));padding:8px 14px;border-radius:var(--r,3px);font-weight:700;text-decoration:none;font-size:var(--t-small,13px)">Join the Discord</a>'+
      '  <button class="btn btn-primary" onclick="window._ackBetaBanner()" style="background:var(--gold,#c9a24a);color:#221803;border:1px solid var(--gold-2,#e3c77e);padding:8px 14px;border-radius:var(--r,3px);font-weight:700;font-size:var(--t-small,13px);cursor:pointer">I understand — let me play</button>'+
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

  function ftueWillFire(){
    // b143: FTUE renders ~1-2s after boot. Our 1.5s check used to win
    // the race and our banner painted before FTUE had a DOM presence,
    // resulting in stacked modals. If the FTUE-completed flag isn't set,
    // FTUE is about to take over — defer entirely.
    try { return localStorage.getItem('hearthrise:ftue:completed') !== '1'; }
    catch (e) { return false; }
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
    // b143: defer for FTUE entirely. The FTUE tour covers "welcome to the
    // game" already; stacking our banner on top adds confusion. After the
    // player completes (or skips) FTUE, the flag flips and we can show on
    // the NEXT reload.
    if(ftueWillFire()) return;
    if(modalAlreadyOpen()){
      // Try again in 2s — let the other modal close first
      setTimeout(maybeShow, 2000);
      return;
    }
    show();
  }

  // b142: Defensive smoke-test button guard.
  //
  // We hid the floating 🧪 button behind an admin-only gate in
  // src/features/smoke-test.js for b141, but smoke-test.js is loaded as
  // a static ESM import without a `?v=` query, so browsers serve it
  // from HTTP cache for up to 10 minutes after a deploy. Result: even
  // on b141, players whose browsers cached the b140 module still see
  // the button. (See ROADMAP backlog "ESM module cache-buster gap".)
  //
  // beta-banner.js is brand-new in b141 and freshly fetched on every
  // build, so we use it as a defense-in-depth guard: periodically check
  // for #smoke-test-btn in the DOM and remove it if the player isn't
  // admin. Cheap, idempotent, runs forever in case some other code
  // path adds it back later.
  function killStrayDevBtn(){
    if(isAdmin()) return;
    var btn = document.getElementById('smoke-test-btn');
    if(btn && btn.parentNode) btn.parentNode.removeChild(btn);
  }
  // Run a few times during startup (smoke-test.js adds the button on a
  // 500ms timeout), then once a second for the next 10s in case of
  // late re-renders, then stop.
  setTimeout(killStrayDevBtn, 600);
  setTimeout(killStrayDevBtn, 1200);
  setTimeout(killStrayDevBtn, 2500);
  var ticks = 0;
  var iv = setInterval(function(){
    killStrayDevBtn();
    if(++ticks >= 10) clearInterval(iv);
  }, 1000);

  // Boot deferred so we don't compete with the changelog/welcome modals.
  // b224: and deferred again behind the account wall — no modal may land in
  // front of the front door.
  function boot(){ setTimeout(maybeShow, 1500); }
  function arm(){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
  if(window.HearthriseGate && typeof window.HearthriseGate.whenOpen === 'function') window.HearthriseGate.whenOpen(arm);
  else arm();

  // Public API for testing + admin-side reset.
  window.HearthriseBetaBanner = {
    show: show,
    ack: ack,
    reset: function(){ try { localStorage.removeItem(ACK_KEY); } catch(_){} },
    DISCORD_INVITE: DISCORD_INVITE,
    /* b342 TEST SEAMS. The stacking bug was a selector that matched nothing,
       which is invisible from outside: the banner "correctly" saw no modal and
       drew. Publishing the predicate AND the list lets the suite build the real
       welcome overlay and assert that this queue actually sees it — the check
       the original selector would have failed for four builds. */
    __modalAlreadyOpen: modalAlreadyOpen,
    __blockingModals: BLOCKING_MODALS,
  };

  console.log('[beta-banner] loaded');
})();
