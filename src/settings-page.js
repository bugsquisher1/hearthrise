// ============================================================
// src/settings-page.js
//
// Replaces the legacy openSettings() with a categorized panel
// designed to work on Steam (mouse + keyboard) and mobile (touch).
//
// Categories:
//   • Audio          — master / music / sfx volumes, mute on blur
//   • Display        — UI scale, theme, reduce motion, damage numbers
//   • Gameplay       — left-hand, auto-eat threshold, food slot
//   • Chat & Privacy — profanity filter, timestamps, mention sound,
//                      whisper permission, block list
//   • Account        — display name, sign in/out, cloud sync
//   • Data           — save now, export, import, backups, reset
//
// Implementation:
//   • Overrides window.openSettings.
//   • Reads from G.settings + window.Chat.getSettings() + observability.
//   • Writes through to G.settings + saveLocal() + Chat.setSetting() so
//     changes persist immediately (no separate Save button).
//   • Sections are <details> elements so they collapse cleanly on mobile.
// ============================================================

(function(){
  'use strict';

  /* b373 — SETTINGS ASKS WITH THE SHARED MODAL, NEVER window.confirm/alert.
     This page held SIX of the game's native dialogs — every one of them on a
     DESTRUCTIVE action (sign out, disconnect, erase, restore, import), i.e.
     precisely the moments a frozen tab is least recoverable and most costly.
     A native dialog blocks the renderer main thread until answered and has
     hard-hung shipped builds twice (b371, b373); see src/utils/dialog.js.

     The safe answer when the service is missing is "no": a destructive action
     that cannot be confirmed must not happen. */
  function ask(opts){
    var D = window.HearthriseDialog;
    if(D && D.confirm) return D.confirm(opts);
    return Promise.resolve(false);
  }
  function say(opts){
    var D = window.HearthriseDialog;
    if(D && D.alert) return D.alert(opts);
    if(typeof window.notify === 'function') window.notify(String(opts && (opts.body||opts.title) || ''), 'kill');
    return Promise.resolve();
  }

  // ══════════════════════════════════════════════════════════════════════
  // UI SCALE (b227) — Settings › Display
  //
  // The click-through audit (finding #2) caught the shipped "UI scale"
  // select writing G.settings.scale with NO consumer anywhere: setting it
  // to 150% left documentElement zoom at 1, font-size at 16px and the app
  // width at 1440. It was the control a player reaches for immediately
  // BEFORE filing "text is too small" — so it was actively teaching
  // players that the game could not be made readable.
  //
  // How the real one works. Every font-size in the game is authored as
  // `calc(<step>px * var(--ui-scale, 1))` — the CSS token ramp in
  // art-direction.css and all 877 hardcoded declarations across the five
  // sheets and the JS-injected <style> blocks. This controller writes ONE
  // custom property onto <html>, and every one of them recomputes. There
  // is no zoom, no transform and no layout hack: nothing moves except the
  // type, which is what the complaint is actually about.
  //
  // Deliberately NOT documentElement.style.fontSize: the codebase is
  // px-authored, not rem-authored (a rem base would move exactly nothing),
  // and NOT CSS `zoom`, which does not change computed font-size and so
  // cannot be asserted on in a test.
  //
  // Range 90–130% in 5% steps. 130% is the ceiling because it is the
  // largest value measured clean — past it the fixed-height chrome (the
  // topbar pills, the sidebar rail) starts to clip, and a dial that breaks
  // the layout at its top end is a dial that half-works.
  //
  // Persistence is two-layer on purpose:
  //   • G.settings.uiScale — the truth, rides the per-account save (and
  //     the cloud sync with it), so the choice follows the account.
  //   • hearthrise:ui-scale via the platform storage seam — a device
  //     mirror, applied at script load so the first painted frame is
  //     already at the player's size instead of flashing 100% first.
  // ══════════════════════════════════════════════════════════════════════
  var UI_SCALE_KEY  = 'hearthrise:ui-scale';
  var SCALE_MIN     = 90;
  var SCALE_MAX     = 130;
  var SCALE_STEP    = 5;
  var SCALE_DEFAULT = 100;

  function store(){ return window.HearthriseStorage || null; }

  function clampScale(n){
    n = Number(n);
    if(!isFinite(n)) return SCALE_DEFAULT;
    n = Math.round(n / SCALE_STEP) * SCALE_STEP;
    return Math.min(SCALE_MAX, Math.max(SCALE_MIN, n));
  }

  function readDeviceScale(){
    var s = store();
    var raw = null;
    try { raw = s ? s.get(UI_SCALE_KEY) : window.localStorage.getItem(UI_SCALE_KEY); } catch(_){}
    return raw == null || raw === '' ? SCALE_DEFAULT : clampScale(raw);
  }

  // The single choke-point. Everything else in this file goes through here.
  function applyScale(pctValue){
    var v = clampScale(pctValue);
    document.documentElement.style.setProperty('--ui-scale', String(v / 100));
    return v;
  }

  function getScale(){
    var G = window.G;
    if(G && G.settings && typeof G.settings.uiScale === 'number') return clampScale(G.settings.uiScale);
    return readDeviceScale();
  }

  // persist=false is the live-preview path while a thumb is being dragged:
  // paint every step, but do not write a save on each of the nine of them.
  function setScale(pctValue, persist){
    var v = applyScale(pctValue);
    if(persist === false) return v;
    var G = window.G;
    if(G && G.settings) G.settings.uiScale = v;
    var s = store();
    try { if(s) s.set(UI_SCALE_KEY, String(v)); else window.localStorage.setItem(UI_SCALE_KEY, String(v)); } catch(_){}
    if(typeof window.saveLocal === 'function') window.saveLocal();
    return v;
  }

  // Boot: paint the device mirror immediately, then adopt the account's own
  // value once the save has hydrated G.settings (a second account signing in
  // on this device must get ITS size, not the last one used here).
  function bootScale(){
    applyScale(readDeviceScale());
    var tries = 0;
    var t = setInterval(function(){
      var G = window.G;
      if(G && G.settings){
        clearInterval(t);
        if(typeof G.settings.uiScale === 'number') applyScale(G.settings.uiScale);
        else G.settings.uiScale = applyScale(readDeviceScale());
      } else if(++tries > 300){ clearInterval(t); }
    }, 100);
  }

  window.HearthriseUIScale = {
    get: getScale, set: setScale, apply: applyScale,
    MIN: SCALE_MIN, MAX: SCALE_MAX, STEP: SCALE_STEP, DEFAULT: SCALE_DEFAULT,
    KEY: UI_SCALE_KEY,
  };
  bootScale();

  // Lazy-init defaults — guarantees fields exist before we read them.
  function ensureSettings(){
    var G = window.G;
    if(!G) return;
    G.settings = G.settings || {};
    var d = G.settings;
    if(typeof d.sfx           !== 'boolean') d.sfx           = true;
    if(typeof d.musicVolume   !== 'number')  d.musicVolume   = 0.7;
    if(typeof d.sfxVolume     !== 'number')  d.sfxVolume     = 0.8;
    if(typeof d.muteOnBlur    !== 'boolean') d.muteOnBlur    = true;
    if(typeof d.reduceFx      !== 'boolean') d.reduceFx      = false;
    if(typeof d.leftHand      !== 'boolean') d.leftHand      = false;
    if(typeof d.uiScale       !== 'number')  d.uiScale       = readDeviceScale();
    // b227: `scale` was a 6-option select nothing read (click-through audit
    // finding #2). It is replaced by `uiScale`; drop the dead key so it stops
    // riding every save.
    if('scale' in d) delete d.scale;
    if(typeof d.theme         !== 'string')  d.theme         = 'dark';
    if(typeof d.showDamage    !== 'boolean') d.showDamage    = true;
    /* b326: the slider must SHOW what the engine will DO. The engine's number
       is HearthriseAuto.eatThreshold(); G.autoEatPct is only its legacy mirror.
       Re-derived on every open (not just when missing) so the panel can never
       display a stale threshold after the food picker or a cloud restore. */
    if(window.HearthriseAuto && typeof window.HearthriseAuto.eatThreshold === 'function'){
      d.autoEatPct = window.HearthriseAuto.eatThreshold();
    } else if(typeof d.autoEatPct !== 'number'){
      d.autoEatPct = (G.autoEatPct != null ? G.autoEatPct : 0.5);
    }
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function pct(n){ return Math.round(n * 100) + '%'; }

  // ── Invite code validation (A11; single-sourced 2026-08-23) ─────────────
  // THE IMPLEMENTATION MOVED to src/net/account-gate.js and this delegates to
  // it. It used to be duplicated here, and a duplicated predicate is the b332
  // shape: two copies, one of them eventually wrong. account-gate.js owns it
  // because account-gate.js IS the front door — it has to work when nothing
  // else on the page has loaded, so it cannot depend on this file, and the
  // dependency therefore has to run this way round. It loads first
  // (index.html:918 vs :1082), so the seam is always present by the time
  // anything here can be clicked.
  //
  // The rule it enforces is unchanged and still worth restating: NEVER read
  // `beta_invites` directly. Its SELECT policy was world-readable to the anon
  // key, so `GET /rest/v1/beta_invites?select=*` handed any visitor every code
  // in the closed beta. `beta_invite_check()` answers only about the ONE code
  // it was given.
  //
  // And since 2026-08-23 this is only UX. The gate is the AFTER INSERT trigger
  // on auth.users in 2026-08-23-beta-invite-gate.sql; skipping this check gets
  // an HTTP 403 from the server, not an account.
  function validateInvite(code){
    var inv = window.HearthriseInvite;
    if(inv && typeof inv.validate === 'function' && inv.validate !== validateInvite){
      return inv.validate(code);
    }
    // account-gate.js did not load. Do NOT invent a second implementation and do
    // NOT pass: hand back a refusal and let the server be the authority it now
    // is. Failing closed here costs one confusing message; failing open here is
    // how the last five ungated accounts happened.
    return Promise.resolve({ ok: false, reason: 'Could not check that code — reload and try again.' });
  }

  // Player-facing auth modal — drives Supabase email/pw sign-in or sign-up.
  // Reachable from Settings → Account when cloud is configured.
  function showInlineAuthModal(mode){
    var isSignUp = mode === 'signup';
    var auth = window.HearthriseAuth;
    if(!auth || !auth.signIn || !auth.signUp){
      if(typeof window.notify === 'function') window.notify('Cloud auth not ready — try again in a second.', 'warn');
      return;
    }
    var overlay = document.createElement('div');
    overlay.className = 'hr-auth-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
    /* OPEN BETA. The code is no longer required and no longer leads the form —
       it is collapsed behind a link, exactly as on the account wall
       (src/net/account-gate.js), so the two signup surfaces teach a visitor the
       same thing. Kept, not deleted: codes already handed out still work, and
       the server still consumes one when it is given. */
    var inviteRow = isSignUp
      ? '<button type="button" data-act="show-invite" style="align-self:flex-start;padding:2px 1px;background:transparent;border:0;color:var(--ink-3,#9aa3b0);text-decoration:underline;cursor:pointer;font:inherit;font-size:calc(14.5px * var(--ui-scale, 1))">Have an invite code?</button>'
      +   '<input type="text" name="invite" data-invite placeholder="Invite code (optional)" style="display:none;padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:calc(14.5px * var(--ui-scale, 1));text-transform:uppercase;letter-spacing:1px" />'
      : '';
    var nameRow = isSignUp
      ? '<input type="text" name="displayName" placeholder="Your name (in-game + leaderboards)" required maxlength="20" style="padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:calc(14.5px * var(--ui-scale, 1))" />'
      : '';
    overlay.innerHTML = ''
      + '<form style="background:#1a1f2e;border:2px solid #f3d181;border-radius:8px;padding:20px;max-width:380px;width:100%;display:flex;flex-direction:column;gap:10px;color:#dfe9ee;font-family:system-ui,sans-serif">'
      +   '<h3 style="margin:0;color:#f3d181">' + (isSignUp ? 'Create your Hearthrise account' : 'Sign in to Hearthrise') + '</h3>'
      +   '<p style="margin:0;font-size:calc(14.5px * var(--ui-scale, 1));color:#9aa3b0">' + (isSignUp
              ? 'Hearthrise is in open beta — make an account and play. It\'s rough in places; tell us in Discord. Your local progress will move to the cloud automatically.'
              : 'Sync your save, join clans, climb leaderboards.') + '</p>'
      +   nameRow
      +   '<input type="email" name="email" placeholder="Email" required style="padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:calc(14.5px * var(--ui-scale, 1))" />'
      +   '<input type="password" name="password" placeholder="Password (8+ characters)" required minlength="8" style="padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:calc(14.5px * var(--ui-scale, 1))" />'
      +   inviteRow
      +   '<div style="display:flex;gap:8px;margin-top:4px">'
      +     '<button type="submit" data-act="primary" style="flex:1;padding:9px;background:#f3d181;color:#0f1320;border:none;border-radius:4px;font-weight:700;cursor:pointer">'
      +       (isSignUp ? 'Create account' : 'Sign in')
      +     '</button>'
      +   '</div>'
      +   '<button type="button" data-act="toggle" style="padding:6px;background:transparent;color:#9aa3b0;border:none;cursor:pointer;font-size:calc(14.5px * var(--ui-scale, 1));text-decoration:underline">'
      +     (isSignUp ? 'Already have an account? Sign in' : 'New here? Create an account')
      +   '</button>'
      +   '<button type="button" data-act="cancel" style="padding:6px;background:transparent;color:#9aa3b0;border:1px solid #2a3142;border-radius:4px;cursor:pointer;font-size:calc(14.5px * var(--ui-scale, 1))">Cancel · Continue offline</button>'
      +   '<div data-status style="font-size:calc(14.5px * var(--ui-scale, 1));color:#e88a8a;min-height:14px;text-align:center"></div>'
      + '</form>';
    var form = overlay.querySelector('form');
    var status = overlay.querySelector('[data-status]');
    function close(){ overlay.remove(); }
    overlay.addEventListener('click', function(e){ if(e.target === overlay) close(); });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
    overlay.querySelector('[data-act="toggle"]').addEventListener('click', function(){
      close();
      showInlineAuthModal(isSignUp ? 'signin' : 'signup');
    });
    var showInvite = overlay.querySelector('[data-act="show-invite"]');
    if(showInvite){
      showInvite.addEventListener('click', function(){
        var f = form.querySelector('[data-invite]');
        if(!f) return;
        f.style.display = '';
        showInvite.style.display = 'none';
        try { f.focus(); } catch(e){}
      });
    }
    form.addEventListener('submit', async function(e){
      e.preventDefault();
      var email = (form.email.value || '').trim();
      var password = form.password.value || '';
      var invite = isSignUp ? ((form.invite && form.invite.value || '').trim().toUpperCase()) : null;
      var displayName = isSignUp ? ((form.displayName && form.displayName.value || '').trim()) : null;
      if(!email || !password){ status.textContent = 'Email and password required.'; return; }
      if(isSignUp){
        // OPEN BETA: no invite code required. One is honoured if given.
        if(!displayName){ status.textContent = 'Pick a name.'; return; }
        if(displayName.length < 2){ status.textContent = 'Name too short.'; return; }
      }
      status.style.color = '#9aa3b0';
      status.textContent = isSignUp ? 'Creating account…' : 'Signing in…';
      try {
        if(isSignUp){
          // Pre-validate ONLY a code the player actually typed. Handing '' to
          // the check would refuse the ordinary open-beta signup on a test for
          // a thing it deliberately does not carry.
          if(invite){
            var validated = await validateInvite(invite);
            if(!validated.ok){
              status.style.color = '#e88a8a';
              /* ONE refusal vocabulary for the whole product. This used to show
                 the server's raw prose while the front door showed a classified
                 sentence, which is two answers to the same question in two
                 places — the shape this repo keeps re-finding. The classifier is
                 pure (src/net/signup-door.js) and names WHICH of unknown / used
                 / throttled / unreachable it was; the raw reason stays as the
                 fallback so a missing module degrades to the old behaviour
                 rather than to silence. */
              var _D = window.HearthriseSignupDoor;
              status.textContent = (_D && typeof _D.classifyInviteRefusal === 'function')
                ? _D.classifyInviteRefusal(validated).message
                : (validated.reason || 'Invalid invite code.');
              return;
            }
          }
          // Pass display_name as user metadata — picked up by the
          // handle_new_user trigger to set profiles.display_name on
          // first row creation. `invite_code` rides the same channel and is
          // read by the auth.users gate trigger (2026-08-23-beta-invite-gate.sql),
          // which consumes it in the same transaction as the account.
          //
          // OPEN BETA: the key is ADDED, never sent empty. `data.invite_code`
          // absent and `data.invite_code = ''` are different values to the gate,
          // and "no code" must reach the server as SQL NULL, not as a blank
          // string it has to guess the meaning of.
          var meta = { display_name: displayName };
          if(invite) meta.invite_code = invite;
          await auth.signUp(email, password, meta);
          // Stash the display name for post-signin pickup. The invite is no
          // longer stashed: it was consumed at account creation, and the
          // post-hoc claim_beta_invite RPC it used to feed has been revoked from
          // `authenticated` — it burned an unused code for whoever called it and
          // granted the caller nothing.
          try {
            localStorage.removeItem('hearthrise:pending-invite');
            localStorage.setItem('hearthrise:pending-name', displayName);
          } catch(e){}
          // Set the in-game player name immediately so the offline guest
          // session reflects the chosen name even before email confirm.
          if(window.G){
            window.G.playerName = displayName;
            if(typeof window.saveLocal === 'function') window.saveLocal();
            if(typeof window.refreshAll === 'function') window.refreshAll();   // b334: window.render has never existed
          }
          status.style.color = '#7f9a4f';
          status.textContent = '✓ Check your inbox for a confirmation email.';
          setTimeout(function(){ close(); if(typeof window.renderSettings === 'function') window.renderSettings(); }, 2200);
        } else {
          await auth.signIn(email, password);
          // No invite claim on sign-in any more — see claimPendingInvite().
          claimPendingInvite();
          var pendingName = null;
          try { pendingName = localStorage.getItem('hearthrise:pending-name'); } catch(e){}
          if(pendingName && window.G){
            window.G.playerName = pendingName;
            if(typeof window.saveLocal === 'function') window.saveLocal();
            try { localStorage.removeItem('hearthrise:pending-name'); } catch(e){}
          }
          status.style.color = '#7f9a4f';
          status.textContent = '✓ Signed in. Syncing your save…';
          setTimeout(function(){ close(); if(typeof window.renderSettings === 'function') window.renderSettings(); }, 800);
        }
      } catch(err){
        status.style.color = '#e88a8a';
        status.textContent = (err && err.message) ? err.message : 'Something went wrong.';
      }
    });

    // ── Invite code helpers ──
    // GUTTED 2026-08-23, deliberately, and kept as a named tombstone rather than
    // deleted so the next person to look for "where do we claim the invite" finds
    // the reason instead of the hole.
    //
    // This used to POST /rest/v1/rpc/claim_beta_invite after sign-in, from a
    // localStorage stash. Two things were wrong with it:
    //   1. It was not a gate. Nothing read beta_invites.used_by to grant or deny
    //      anything, so an account that never claimed played identically to one
    //      that did. Five of the eight live accounts had never claimed.
    //   2. It was a griefing surface. The RPC was executable by `authenticated`
    //      and consumed any unused code for whoever called it, at 12/minute,
    //      granting the caller nothing — one beta account could have destroyed
    //      every unsent invitation in about ninety seconds.
    // The code is now consumed by the auth.users trigger at account creation,
    // and the RPC's `authenticated` grant is revoked. All this does is clear the
    // stale key off devices that still carry one.
    function claimPendingInvite(){
      try { localStorage.removeItem('hearthrise:pending-invite'); } catch(e){}
    }
    document.body.appendChild(overlay);
    setTimeout(function(){ var f = form.querySelector('input[name="email"]'); if(f) f.focus(); }, 50);
  }

  function renderSection(open, title, html){
    return ''
      + '<details class="settings-section"' + (open ? ' open' : '') + '>'
      +   '<summary>' + esc(title) + '</summary>'
      +   '<div class="ss-body">' + html + '</div>'
      + '</details>';
  }

  // ── Audio ───────────────────────────────────────────────────
  function audioHtml(){
    var d = window.G.settings;
    return ''
      + row('Master sound', toggle('sfx', d.sfx))
      + sliderRow('Music volume', 'musicVolume', d.musicVolume, 0, 1, 0.05, pct(d.musicVolume))
      + sliderRow('Sound effects volume', 'sfxVolume', d.sfxVolume, 0, 1, 0.05, pct(d.sfxVolume))
      + row('Mute when window unfocused', toggle('muteOnBlur', d.muteOnBlur));
  }

  // ── Display ────────────────────────────────────────────────
  function displayHtml(){
    var d = window.G.settings;
    var scaleNow = getScale();
    // Bespoke row rather than sliderRow(): this one previews live on `input`
    // (every 5% step, as the thumb moves) and only writes the save on
    // `change`, and its readout is a percentage of its own, not pct(0..1).
    var scaleRow = ''
      + '<div class="ss-row">'
      +   '<div class="ss-label">UI scale</div>'
      +   '<div class="ss-slider">'
      +     '<input type="range" id="set-ui-scale" min="' + SCALE_MIN + '" max="' + SCALE_MAX + '"'
      +       ' step="' + SCALE_STEP + '" value="' + scaleNow + '"'
      +       ' aria-label="UI scale" aria-valuetext="' + scaleNow + ' percent" />'
      +     '<span class="ss-slider-value" id="set-ui-scale-val">' + scaleNow + '%</span>'
      +   '</div>'
      + '</div>'
      + '<div class="ss-hint">Sets the size of all text in the game. Changes apply as you drag,'
      +   ' and follow your account to any device.</div>';

    // Theme picker — driven by HearthriseTheme (theme-picker.js).
    var current = (window.HearthriseTheme && window.HearthriseTheme.getTheme && window.HearthriseTheme.getTheme()) || 'hearthlight';
    var themes = (window.HearthriseTheme && window.HearthriseTheme.list && window.HearthriseTheme.list()) || [
      { id:'hearthlight', label:'Hearthlight', desc:'Candle-lit hall — deep warm dark + gilt' },
    ];
    var themeCards = themes.map(function(t){
      var active = (t.id === current);
      return ''
        + '<button class="btn btn-sm ss-theme-card' + (active ? ' active' : '') + '" '
        +   'data-theme-id="' + esc(t.id) + '" '
        +   'style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;flex:1;text-align:left;padding:10px 12px;'
        +   (active ? 'border-color:var(--gold);background:var(--gold-bg);' : '') + '">'
        +   '<span style="font-weight:700;font-size:calc(14.5px * var(--ui-scale, 1))">' + esc(t.label) + (active ? ' ✓' : '') + '</span>'
        +   '<span style="font-size:calc(14.5px * var(--ui-scale, 1));opacity:.75">' + esc(t.desc) + '</span>'
        + '</button>';
    }).join('');
    return ''
      + scaleRow
      + '<div class="ss-row" style="flex-direction:column;align-items:stretch;gap:8px"><div class="ss-label">Theme</div>'
      +   '<div style="display:flex;gap:8px;flex-wrap:wrap">' + themeCards + '</div>'
      + '</div>'
      + row('Reduce motion / visual effects', toggle('reduceFx', d.reduceFx))
      + row('Show damage numbers', toggle('showDamage', d.showDamage));
  }

  /* ── AUTO-EAT, AND WHY THIS IS THREE ROWS INSTEAD OF ONE SLIDER ──────────
     b372 (F7, live audit 2026-08-17). Tyler sat at 3/10 HP for dozens of swings
     with edible food in the bag and died twice, having read "Auto-eat HP
     threshold — 50%" on this very screen. Nothing was broken downstream: the
     engine gate in features/auto-actions.js `maybeAutoEat()` is
     `enabled && owned`, and BOTH were false. The screen was the defect. It
     rendered a live, draggable, persisted control for a feature the character
     did not own (Auto-Eat is 100 Bounty Marks, TRAITS.auto_eat) and for a
     switch that has no other UI anywhere in the game — so the threshold read as
     a promise of healing that could never be kept.

     Two failures, so two fixes, and they are separate rows on purpose:

       • UNOWNED → no operative control at all. A locked row that names the
         price and the shop, plus the honest alternative (press Eat). Same
         pattern the b361 combat screen already uses — `renderCombat()`'s
         `_foodNote` says exactly this — so the two surfaces now agree instead
         of one contradicting the other.

       • OWNED → the ON/OFF switch is SHOWN. `autoActions.eat.enabled` was
         reachable from precisely two places (buying the trait, and picking a
         food), so a player who turned it off from the combat picker, or a
         pre-b217 save grandfathered by migration v5→v6 with `enabled:false`,
         had a threshold slider governing a switch they could not see and could
         not turn back on. The switch is the feature; the threshold is a detail
         of it.

     The toggle carries `data-autoeat` rather than `data-set` because it is NOT
     a `G.settings` key — `HearthriseAuto.setEat()` is the one authoritative
     writer (b326/b329), and routing it through the generic settings binder
     would create the second writer that whole comment block exists to prevent. */
  /* b45x — ANY tier unlocks the row. Asking about a specific trait id would
     lock the slider for a character who somehow held only Auto-Eat II, which is
     exactly the "gate reads an id instead of a capability" bug the server's
     entitlement gate was widened to avoid. */
  function ownsAutoEat(){
    try {
      var AE = window.HearthriseCore && window.HearthriseCore.autoEat;
      if (AE && typeof AE.autoEatTier === 'function') return AE.autoEatTier((window.G && window.G.traits) || {}) > 0;
      return (typeof window.hasTrait === 'function') && !!window.hasTrait('auto_eat');
    }
    catch(e){ return false; }
  }
  function autoEatPrice(){
    /* The fallback tracks the ENTRY tier's authored price (src/core/auto-eat.js
       AUTO_EAT_TIERS[1].marks). A stale literal here is a lie about a price. */
    var t = (window.TRAITS && window.TRAITS.auto_eat) || { cost:15, currency:'marks' };
    var n = Number(t.cost); if(!isFinite(n)) n = 15;
    return n.toLocaleString() + (t.currency === 'marks' ? ' Bounty Marks' : ' gold');
  }
  /* ── THE HINT UNDER THE DIAL — ONE SOURCE, THREE STATES ──────────────────
     It used to be written out TWICE (here and again in the `data-autoeat`
     change handler, which repaints it rather than re-rendering the panel), so
     the two copies could disagree — and the moment the ruling below added a
     third state they would have.

     ⚠ THE WARNING IS A BINDING CONDITION OF ARMING THE SYNC, not decoration.
       Designer ruling 2b (2026-08-31): the auto-eat ON/OFF toggle now reaches
       the server, so switching it off really does mean nothing heals you while
       you are away — the accrual engine's `fx.autoEat()` is gated on that exact
       column and a measured 12-hour night with it off pays 0 kills and dies at
       the first fight. The ruling's answer to "they might not have understood"
       is never a guardrail; it is making the consequence legible, AT the
       control, before the night rather than after it.

       BOTH ENDS, because they are one outcome. The dial's 0% minimum
       reproduces the same no-heal night through a different key
       (`clampThreshold`'s b326 note keeps a deliberate zero meaning "manual
       healing only" — that stays), so a warning on the switch alone would be
       half the rule. Same sentence, so the two controls cannot be read as two
       different severities.

     The copy is the Designer's, verbatim. Do not reword it here without them —
     the death receipt (src/net/accrue.js `receiptDeathCause`) is the other half
     of the same promise and the two are meant to rhyme. */
  var AUTO_EAT_AWAY_WARNING =
    'You will not heal while away. A fight that outlasts your health ends the night early.';
  function autoEatHint(on, threshold, upsell){
    if(!on){
      return 'Auto-eat is switched OFF — this threshold does nothing until you turn it on above. '
        + AUTO_EAT_AWAY_WARNING;
    }
    if(!(Number(threshold) > 0)){
      return 'At 0% auto-eat never fires — healing in combat is manual. ' + AUTO_EAT_AWAY_WARNING;
    }
    /* THE TOP END, LABELLED HONESTLY (Designer ruling 2c, 2026-08-31). This
       rides WITH the engine fix and is not a substitute for it — copy at this
       end was explicitly rejected as the answer. `resolveAutoEat` now refuses a
       zero-deficit eat, so 100% has stopped meaning "burn a Provision every
       swing at full health" and started meaning the max-safety setting a
       tier-II owner paid 100 Marks for. The label says that in the player's own
       words instead of leaving them to infer it from a percentage that reads
       like a paradox. Deliberately NOT a warning: the 0% end warns because
       there is a real consequence to inform; here there is none left. */
    if(Number(threshold) >= 1){
      return '100% — eat the moment I take any damage. '
        + 'Feasts & Draughts are never auto-eaten.' + (upsell || '');
    }
    return 'Eat one Provision automatically on each swing your HP is below this percentage. '
      + 'Feasts & Draughts are never auto-eaten.' + (upsell || '');
  }

  /* Re-say the hint from the LIVE control values. Both writers (the switch and
     the dial) call this, so neither can leave the other's sentence stale — and
     it reads the DOM rather than being handed a value, because the two handlers
     fire on different elements and a parameter would be a third statement of
     the same state. */
  function repaintAutoEatHint(root){
    if(!root) return;
    var slider = root.querySelector('[data-set="autoEatPct"]');
    var toggle = root.querySelector('[data-autoeat="enabled"]');
    if(!slider || !toggle) return;
    var row = slider.closest ? slider.closest('.ss-row') : null;
    var hint = row ? row.nextElementSibling : null;
    if(!hint || !hint.classList || !hint.classList.contains('ss-hint')) return;
    /* The upsell is carried on the node, not re-derived. It is a PURCHASE
       PROMPT read from TRAITS at render time; re-deriving it on every toggle
       would make this a second reader of the price, which is the drift the
       death sheet's b432 note is about. Stashing it means the tier-II line
       survives a repaint instead of vanishing on the first flip. */
    hint.textContent = autoEatHint(!!toggle.checked, parseFloat(slider.value),
      hint.getAttribute('data-upsell') || '');
  }

  function autoEatHtml(){
    var d = window.G.settings;
    if(!ownsAutoEat()){
      return '<div class="ss-row is-locked"><div class="ss-label">Auto-eat HP threshold</div>'
        +      '<span class="ss-locked-tag">Locked</span></div>'
        +    '<div class="ss-hint">Auto-Eat is a Store unlock (' + esc(autoEatPrice())
        +      ' — Store → Bounty Shop). Until you own it, healing in combat is manual: '
        +      'press <b>Eat</b> beside your champion on the Combat screen.</div>';
    }
    var eat = (window.HearthriseAuto && window.HearthriseAuto.getEat)
      ? window.HearthriseAuto.getEat() : null;
    var on = !!(eat && eat.enabled);
    /* b45x — THE TIER CEILING IS THE SLIDER'S MAX, not a footnote under it.
       Auto-Eat I entitles a trigger point up to 25%; `HearthriseAuto.eatThreshold()`
       clamps there and the server's hr_set_auto_eat clamps the stored value the same
       way. A slider that let a tier-I owner drag to 50% would be showing them a
       number the fight does not honour — the exact class of lie b326 was written
       about. So the control cannot express what the entitlement does not cover, and
       the hint says why. */
    var maxT = 1;
    var tier = 1;
    try {
      var AE = window.HearthriseCore && window.HearthriseCore.autoEat;
      if (AE && typeof AE.autoEatTier === 'function') {
        tier = AE.autoEatTier(window.G.traits || {});
        maxT = AE.maxPctForTier(tier) / 100;
      }
    } catch(e){}
    var upsell = (tier < 2 && window.TRAITS && window.TRAITS.auto_eat_2)
      ? ' Auto-Eat II (' + esc(String(Number(window.TRAITS.auto_eat_2.cost) || 100).toLocaleString())
        + ' Bounty Marks — Store → Bounty Shop) raises the ceiling.'
      : '';
    var val = Math.min(d.autoEatPct, maxT);
    return '<div class="ss-row"><div class="ss-label">Auto-eat</div>'
      +      '<label class="ss-toggle"><input type="checkbox" data-autoeat="enabled"'
      +        (on ? ' checked' : '') + ' />'
      +        '<span class="ss-toggle-track"><span class="ss-toggle-knob"></span></span></label>'
      +    '</div>'
      + sliderRow('Auto-eat HP threshold', 'autoEatPct', val,
          0, maxT, 0.05, pct(val), autoEatHint(on, val, upsell),
          'data-upsell="' + esc(upsell) + '"');
  }

  // ── Gameplay ───────────────────────────────────────────────
  function gameplayHtml(){
    var d = window.G.settings;
    return ''
      + row('Left-handed mode (mobile)', toggle('leftHand', d.leftHand))
      + autoEatHtml()
      + '<div class="ss-row"><div class="ss-label">Replay tutorial</div>'
      +   '<button class="btn btn-sm" id="set-replay-tutorial">Show again</button></div>';
  }

  // ── Chat & Privacy ─────────────────────────────────────────
  function chatHtml(){
    var c = (window.Chat && window.Chat.getSettings) ? window.Chat.getSettings() : {};
    var blockedCount = 0;
    try { blockedCount = JSON.parse(localStorage.getItem('hearthrise:chat:blocked') || '[]').length; } catch(e){}
    var whisperOpts = [
      ['all',  'Everyone'],
      ['clan', 'Clan members only'],
      ['none', 'No one'],
    ];
    return ''
      + row('Profanity filter', chatToggle('profanityFilter', c.profanityFilter !== false))
      + '<div class="ss-hint">Masks common curse words. Targeted slurs are always filtered regardless of this setting.</div>'
      + row('Show timestamps', chatToggle('showTimestamps', c.showTimestamps !== false))
      + row('Sound on @mention', chatToggle('soundOnMention', c.soundOnMention !== false))
      + selectRow('Allow whispers from', 'whisperPermission', c.whisperPermission || 'all', whisperOpts, 'chat')
      + '<div class="ss-row"><div class="ss-label">Block list (' + blockedCount + ')</div>'
      +   '<button class="btn btn-sm" id="set-show-blocklist">Manage</button></div>';
  }

  // ── Account ────────────────────────────────────────────────
  function accountHtml(){
    var G = window.G;
    var acct = G.account;
    var nameInput = ''
      + '<div class="ss-row"><div class="ss-label">Display name</div>'
      +   '<div style="display:flex;gap:8px">'
      +     '<input type="text" id="set-display-name" maxlength="20" value="' + esc(G.playerName || '') + '" />'
      +     '<button class="btn btn-sm" id="set-name-save">Save</button>'
      +   '</div>'
      + '</div>';
    // Live cloud session takes precedence over the legacy guest-account record.
    var liveSession = (window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession()) || null;
    var auth;
    if (liveSession && liveSession.user) {
      /* b371 — THIS LINE WAS A HARDCODED STRING. It claimed "Cloud save active"
         to anyone with a session, through any number of failed upserts, and
         advertised a 30s cadence the game stopped using when snapshotIntervalMs
         became 60000. Both halves are now derived: the claim from the last
         CONFIRMED game_saves upsert, the cadence from the live sync config. */
      var health = (window.cloudSaveLine ? window.cloudSaveLine() : { level: 'unknown', text: 'Cloud save connecting…' });
      var syncCfg = null;
      try { syncCfg = window.HearthriseSync && window.HearthriseSync.getConfig && window.HearthriseSync.getConfig(); } catch (e) {}
      var everySec = Math.max(1, Math.round(((syncCfg && syncCfg.snapshotIntervalMs) || 60000) / 1000));
      var meta = (health.level === 'ok')
        ? (health.text + ' · syncing every ' + everySec + 's')
        : health.text;
      var metaStyle = (health.level === 'warn') ? ' style="color:var(--role-danger, var(--ink-2))"' : '';
      auth = ''
        + '<div class="ss-card">'
        +   '<div class="ss-card-title">' + esc(liveSession.user.email || 'Signed in') + '</div>'
        +   '<div class="ss-card-meta"' + metaStyle + '>' + esc(meta) + '</div>'
        +   '<button class="btn btn-sm btn-danger" id="set-cloud-signout" style="margin-top:8px">Sign out</button>'
        + '</div>';
    } else if (acct) {
      auth = ''
        + '<div class="ss-card">'
        +   '<div class="ss-card-title">' + esc(acct.displayName || 'Account') + '</div>'
        +   '<div class="ss-card-meta">Signed in via ' + esc(acct.provider || 'guest') + '</div>'
        +   '<button class="btn btn-sm btn-danger" id="set-sign-out">Sign out</button>'
        + '</div>';
    } else {
      // Cloud configured? Show real email/pw flow. Otherwise show offline-only message.
      var cloudReady = !!(window.HearthriseSupabase && window.HearthriseSupabase.isConfigured && window.HearthriseSupabase.isConfigured());
      auth = cloudReady
        ? ('<div class="ss-card">'
          /* b224: reaching this branch means the session lapsed mid-play — the
             account wall is what a signed-out player meets at the front door.
             The old hint ("Don't want an account? You can keep playing
             offline") invited exactly the mode the product no longer has, so
             it is gone; the honest reassurance about the local save stays. */
          +   '<div class="ss-card-title">Signed out</div>'
          +   '<div class="ss-card-meta">Sign back in to resume syncing, chat, clans and the leaderboards. Your progress is safe on this device in the meantime.</div>'
          +   '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">'
          +     '<button class="btn btn-sm btn-primary" id="set-cloud-signin">Sign in</button>'
          +     '<button class="btn btn-sm" id="set-cloud-signup">Create account</button>'
          +   '</div>'
          + '</div>')
        : ('<div class="ss-card">'
          +   '<div class="ss-card-title">No realm connected</div>'
          +   '<div class="ss-card-meta">This build has no sign-in service configured, so cloud features are unavailable. Your save lives on this device.</div>'
          + '</div>');
    }
    // Cloud sync status copy. Three states:
    //   • Have a recorded sync timestamp → show it
    //   • Live session, no sync yet → "Auto-syncing — waiting for first round-trip"
    //   • No session at all → "Offline (sign in to enable)"
    // Previously the "Never synced." string was shown even while signed in
    // and auto-syncing every 30s, which directly contradicted the auth
    // banner above and made it look like cloud was broken.
    var cloudMeta;
    if (G.cloudSyncedAt) {
      cloudMeta = 'Last synced: ' + new Date(G.cloudSyncedAt).toLocaleString();
    } else if (liveSession && liveSession.user) {
      cloudMeta = 'Auto-syncing every 60s — waiting for first round-trip.';
    } else {
      cloudMeta = 'Offline. Sign in above to enable cloud sync.';
    }

    // ── Cloud setup (Supabase credentials) ──
    // Only shown for self-hosters / dev forks. Actual players never see
    // this — credentials are baked into supabase-bootstrap.js DEFAULT_CONFIG.
    // To reveal for debugging, append ?cloudConfig=1 to the URL.
    var sbConfig = (window.HearthriseSupabase && window.HearthriseSupabase.getConfig())
      || { url: '', anonKey: '' };
    var hasCloud = !!sbConfig.url && !!sbConfig.anonKey;
    var showCloudSetup = (typeof location !== 'undefined' && /[?&]cloudConfig=1/.test(location.search));
    var cloudSetup = !showCloudSetup ? '' : ''
      + '<div class="ss-card" style="display:block">'
      +   '<div class="ss-card-title">Cloud setup (developer)</div>'
      +   '<div class="ss-card-meta">' + (hasCloud
              ? 'Connected to ' + esc(sbConfig.url.replace(/^https?:\/\//, ''))
              : 'Self-hoster paste form. Production builds ship with credentials baked in.') + '</div>'
      +   '<div class="ss-row" style="margin-top:8px"><div class="ss-label">Supabase URL</div>'
      +     '<input type="text" id="set-sb-url" placeholder="https://xxxx.supabase.co" value="' + esc(sbConfig.url || '') + '" />'
      +   '</div>'
      +   '<div class="ss-row"><div class="ss-label">Anon key</div>'
      +     '<input type="text" id="set-sb-key" placeholder="eyJhbG..." value="' + esc(sbConfig.anonKey || '') + '" style="font-family:monospace;font-size:calc(14.5px * var(--ui-scale, 1))" />'
      +   '</div>'
      +   '<div class="ss-row" style="justify-content:flex-end;gap:8px">'
      +     (hasCloud ? '<button class="btn btn-sm btn-danger" id="set-sb-disconnect">Disconnect</button>' : '')
      +     '<button class="btn btn-sm" id="set-sb-connect">' + (hasCloud ? 'Update' : 'Connect') + '</button>'
      +   '</div>'
      +   '<div class="ss-hint">See <code>src/net/SUPABASE_SETUP.md</code> for the schema setup. Anon keys are public by design.</div>'
      + '</div>';

    // ── Beta tester block — discord, bug report, build version, what's new ──
    var DISCORD_INVITE = 'https://discord.gg/eJrUSUJM3M';
    var build = (window.HearthriseBuild && window.HearthriseBuild.buildString && window.HearthriseBuild.buildString()) || 'unknown';
    var beta = ''
      + '<div class="ss-card" style="display:block">'
      +   '<div class="ss-card-title">Beta tester tools</div>'
      +   '<div class="ss-card-meta">Found a bug? See something off? Send it our way.</div>'
      +   '<div class="ss-row" style="margin-top:8px;gap:6px;flex-wrap:wrap">'
      +     '<button class="btn btn-sm" id="set-bug-report">Report bug</button>'
      +     '<button class="btn btn-sm" id="set-show-changelog">What\'s new</button>'
      +     '<a class="btn btn-sm" href="' + esc(DISCORD_INVITE) + '" target="_blank" rel="noopener" style="text-decoration:none">Discord</a>'
      +   '</div>'
      +   '<div class="ss-hint" style="margin-top:8px">Build <code>' + esc(build) + '</code></div>'
      + '</div>';

    return ''
      + nameInput
      + auth
      + '<div class="ss-row"><div class="ss-label">Cloud sync</div>'
      +   '<div style="display:flex;gap:8px">'
      +     '<button class="btn btn-sm" id="set-cloud-sync">Sync now</button>'
      +     '<button class="btn btn-sm" id="set-cloud-verify">Verify</button>'
      +   '</div>'
      + '</div>'
      + '<div class="ss-hint">' + esc(cloudMeta) + '</div>'
      + '<div class="ss-hint" id="set-cloud-verify-out" style="white-space:pre-line"></div>'
      + beta
      + cloudSetup;
  }

  // ── Data ───────────────────────────────────────────────────
  function dataHtml(){
    var backups = [];
    try {
      for(var i=0; i<localStorage.length; i++){
        var k = localStorage.key(i);
        if(k && k.indexOf('hearthrise:save-backup:') === 0){
          backups.push(k);
        }
      }
    } catch(e){}
    backups.sort();
    return ''
      + '<div class="ss-row"><div class="ss-label">Save now</div>'
      +   '<button class="btn btn-sm" id="set-save-now">Save</button>'
      + '</div>'
      + '<div class="ss-row"><div class="ss-label">Export save</div>'
      +   '<button class="btn btn-sm" id="set-export">Download JSON</button>'
      + '</div>'
      + '<div class="ss-row"><div class="ss-label">Import save</div>'
      +   '<button class="btn btn-sm" id="set-import">From file…</button>'
      + '</div>'
      + '<div class="ss-row"><div class="ss-label">Save backups</div>'
      +   '<div class="ss-meta">' + (backups.length ? backups.length + ' available' : 'none') + '</div>'
      + '</div>'
      + (backups.length
          ? '<div class="ss-backup-list">'
              + backups.map(function(k){
                  var ver = k.replace('hearthrise:save-backup:', '');
                  // Try to peek at the backup's metadata so the player
                  // sees something useful (last seen, slot, character)
                  // instead of just a version number.
                  var meta = '';
                  try {
                    var raw = localStorage.getItem(k);
                    if(raw){
                      var parsed = JSON.parse(raw);
                      var lastSeen = parsed && parsed.lastSeen
                        ? new Date(parsed.lastSeen).toLocaleString()
                        : 'unknown';
                      var name = (parsed && parsed.playerName) || 'Adventurer';
                      meta = ' · ' + esc(name) + ' · last seen ' + esc(lastSeen);
                    }
                  } catch(e){}
                  return '<div class="ss-backup-row">'
                       +   '<span><b>' + esc(ver) + '</b><small style="color:#8a92a0">' + meta + '</small></span>'
                       +   '<button class="btn btn-sm" data-restore="' + esc(k) + '">Restore</button>'
                       + '</div>';
                }).join('')
            + '<div class="ss-hint">Restoring a backup overwrites your current save and reloads the game. The current save is NOT auto-backed up before the swap — export it first if you want a safety net.</div>'
            + '</div>'
          : '<div class="ss-hint">No automatic backups yet. Backups are created the first time the save schema migrates, so you\'ll see them after the next major game update.</div>')
      + '<div class="ss-row danger"><div class="ss-label">Reset character</div>'
      +   '<button class="btn btn-sm btn-danger" id="set-reset">Erase + reload</button>'
      + '</div>'
      + '<div class="ss-hint">Reset clears the active character\'s save. Other character slots are unaffected.</div>';
  }

  // ── Helpers ────────────────────────────────────────────────
  function row(label, controlHtml){
    return '<div class="ss-row"><div class="ss-label">' + esc(label) + '</div>' + controlHtml + '</div>';
  }
  function toggle(key, on){
    return '<label class="ss-toggle">'
      +   '<input type="checkbox" data-set="' + esc(key) + '"' + (on ? ' checked' : '') + ' />'
      +   '<span class="ss-toggle-track"><span class="ss-toggle-knob"></span></span>'
      + '</label>';
  }
  function chatToggle(key, on){
    return '<label class="ss-toggle">'
      +   '<input type="checkbox" data-chat-set="' + esc(key) + '"' + (on ? ' checked' : '') + ' />'
      +   '<span class="ss-toggle-track"><span class="ss-toggle-knob"></span></span>'
      + '</label>';
  }
  /* `hintAttrs` is an optional attribute string on the hint node — used by the
     auto-eat row to CARRY its upsell across a repaint (see
     repaintAutoEatHint), so the price stays read from TRAITS exactly once. */
  function sliderRow(label, key, value, min, max, step, displayValue, hint, hintAttrs){
    return '<div class="ss-row">'
      +     '<div class="ss-label">' + esc(label) + '</div>'
      +     '<div class="ss-slider">'
      +       '<input type="range" data-set="' + esc(key) + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '" />'
      +       '<span class="ss-slider-value">' + esc(displayValue) + '</span>'
      +     '</div>'
      +   '</div>'
      + (hint ? '<div class="ss-hint"' + (hintAttrs ? ' ' + hintAttrs : '') + '>' + esc(hint) + '</div>' : '');
  }
  function selectRow(label, key, current, options, namespace){
    var attr = (namespace === 'chat') ? 'data-chat-set' : 'data-set';
    return '<div class="ss-row">'
      +     '<div class="ss-label">' + esc(label) + '</div>'
      +     '<select ' + attr + '="' + esc(key) + '">'
      +       options.map(function(o){
                return '<option value="' + esc(o[0]) + '"' + (current === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
              }).join('')
      +     '</select>'
      +   '</div>';
  }

  // ── Wire input → state ─────────────────────────────────────
  function bindControls(root){
    // UI scale — outside the generic [data-set] wiring because it needs two
    // different behaviours on two different events: `input` repaints the whole
    // game live on every 5% step of the drag, `change` is the only one that
    // writes a save.
    var scaleEl = root.querySelector('#set-ui-scale');
    if(scaleEl){
      var readout = root.querySelector('#set-ui-scale-val');
      var paint = function(persist){
        var v = setScale(scaleEl.value, persist);
        scaleEl.value = String(v);
        scaleEl.setAttribute('aria-valuetext', v + ' percent');
        if(readout) readout.textContent = v + '%';
      };
      scaleEl.addEventListener('input',  function(){ paint(false); });
      scaleEl.addEventListener('change', function(){ paint(true); });
    }

    // G.settings controls
    root.querySelectorAll('[data-set]').forEach(function(el){
      var key = el.getAttribute('data-set');
      el.addEventListener('change', function(){
        var v;
        if(el.type === 'checkbox') v = el.checked;
        else if(el.type === 'range') v = parseFloat(el.value);
        else v = el.value;
        window.G.settings[key] = v;
        // Side effects
        if(key === 'reduceFx'){
          document.documentElement.style.setProperty('--reduce-fx', v ? '1' : '0');
        }
        if(key === 'theme'){
          // Legacy convention: 'dark' = data-theme attribute set, 'cozy' = no attribute
          if(v === 'dark') document.body.setAttribute('data-theme', 'dark');
          else document.body.removeAttribute('data-theme');
          try { localStorage.setItem('hb-theme', v === 'dark' ? 'dark' : 'cozy'); } catch(_){}
        }
        if(key === 'autoEatPct'){
          /* b326 (Xarn, live b324): this slider used to write ONLY
             `G.settings.autoEatPct` + `G.autoEatPct` — neither of which the
             engine reads. `HearthriseAuto.maybeAutoEat()` triggers on
             `G.autoActions.eat.threshold`, and `ensureShape()` seeds that from
             `G.autoEatPct` exactly ONCE (when the branch is first created), so
             every later move of this slider was inert and auto-eat kept firing
             at the 50% default no matter what the UI said. Route through the
             one authoritative writer; it mirrors G.autoEatPct back for the
             legacy fallback path. */
          if(window.HearthriseAuto && typeof window.HearthriseAuto.setEat === 'function'){
            window.HearthriseAuto.setEat({ threshold: v });
          }
          window.G.autoEatPct = v;
          /* THE DIAL REPAINTS ITS OWN HINT NOW. It never did — so dragging to
             0% left "Eat one Provision automatically…" sitting under a control
             that had just been set to never fire, which is the b326 class of
             lie in the surface rather than the engine. It is a binding
             condition of the 2b arm that the 0% end carries the away warning,
             and a warning that only appears on the next panel open is not at
             the control. */
          repaintAutoEatHint(root);
        }
        if(typeof window.saveLocal === 'function') window.saveLocal();
        // Update visible slider value
        if(el.type === 'range'){
          var disp = el.parentElement.querySelector('.ss-slider-value');
          if(disp) disp.textContent = pct(v);
        }
      });
    });
    /* b372 (F7): the auto-eat ON/OFF switch. Deliberately NOT a `data-set` key —
       `autoActions.eat.enabled` lives in HearthriseAuto, whose `setEat()` is the
       one writer, and it persists itself (debounced saveLocal). Re-rendering the
       panel is what repaints the threshold hint underneath, which otherwise
       still claims the slider is live after the switch goes off. */
    root.querySelectorAll('[data-autoeat]').forEach(function(el){
      el.addEventListener('change', function(){
        if(window.HearthriseAuto && typeof window.HearthriseAuto.setEat === 'function'){
          window.HearthriseAuto.setEat({ enabled: !!el.checked });
        }
        if(typeof window.saveLocal === 'function') window.saveLocal();
        /* Repaint the ONE thing that changed rather than the whole panel: a
           re-render would collapse every section the player had opened and
           throw away their scroll position, which is a worse bug than the
           stale sentence. */
        repaintAutoEatHint(root);
      });
    });
    // Chat settings controls
    root.querySelectorAll('[data-chat-set]').forEach(function(el){
      var key = el.getAttribute('data-chat-set');
      el.addEventListener('change', function(){
        var v;
        if(el.type === 'checkbox') v = el.checked;
        else v = el.value;
        if(window.Chat && typeof window.Chat.setSetting === 'function'){
          window.Chat.setSetting(key, v);
        }
      });
    });

    // Account controls
    // b221: route the rename through the identity seam. This field used to be
    // a SECOND writer of the display name with its own (nonexistent) rules —
    // trim + slice(0,20) and straight into G.playerName. That meant a player
    // could set a name here that the claim flow would have refused, that no
    // server row backed, and that silently diverged from the unique name every
    // other player sees in chat and on the market. One writer, one rule set.
    var saveName = root.querySelector('#set-name-save');
    if(saveName) saveName.addEventListener('click', function(){
      var raw = (root.querySelector('#set-display-name').value || '');
      var id = window.HearthriseIdentity;
      if(id && typeof id.claimName === 'function'){
        var v = id.validateName(raw);
        if(!v.ok){
          if(typeof window.notify === 'function') window.notify(v.message, 'kill');
          return;
        }
        saveName.disabled = true;
        id.claimName(raw).then(function(d){
          saveName.disabled = false;
          if(d.action === 'confirmed'){
            if(typeof window.notify === 'function') window.notify('You are known as ' + d.name + ' throughout the realm.', 'levelup');
          } else if(d.action === 'provisional'){
            if(typeof window.notify === 'function') window.notify('Name set to ' + d.name + '.', 'info');
          } else if(typeof window.notify === 'function'){
            window.notify(d.message || 'That name could not be claimed.', 'kill');
          }
          if(typeof window.updateTopbar === 'function') window.updateTopbar();
          if(typeof window.renderSettings === 'function') window.renderSettings();
        }).catch(function(){
          saveName.disabled = false;
          if(typeof window.notify === 'function') window.notify('Could not reach the server — try again in a moment.', 'kill');
        });
        return;
      }
      var fallback = raw.trim().slice(0, 20);
      if(!fallback) return;
      window.G.playerName = fallback;
      if(typeof window.updateTopbar === 'function') window.updateTopbar();
      if(typeof window.saveLocal === 'function') window.saveLocal();
      if(typeof window.notify === 'function') window.notify('Display name saved.', 'info');
    });
    var signOut = root.querySelector('#set-sign-out');
    if(signOut) signOut.addEventListener('click', function(){
      if(window.NetClient && typeof window.NetClient.signOut === 'function'){
        window.NetClient.signOut();
        window.openSettings();
      }
    });
    root.querySelectorAll('[data-signin]').forEach(function(b){
      b.addEventListener('click', function(){
        var p = b.getAttribute('data-signin');
        if(window.NetClient && typeof window.NetClient.signIn === 'function'){
          window.NetClient.signIn(p).then(function(){ window.openSettings(); });
        }
      });
    });
    var vout = root.querySelector('#set-cloud-verify-out');
    var cloud = root.querySelector('#set-cloud-sync');
    if(cloud) cloud.addEventListener('click', async function(){
      // b299: use the REAL sync (snapshotIfDue), not the dead mock window.cloudSync
      // (legacy NetClient, no endpoint) that this button used to call.
      var old = cloud.textContent; cloud.disabled = true; cloud.textContent = 'Syncing…';
      var ok = false;
      try { if(window.HearthriseSync && window.HearthriseSync.snapshotIfDue) ok = await window.HearthriseSync.snapshotIfDue(true); }
      catch(e){}
      cloud.textContent = old; cloud.disabled = false;
      if(vout) vout.textContent = ok
        ? '✓ Synced to the cloud just now.'
        : '✗ Sync did not complete (offline, not signed in, or a server hiccup).';
    });
    var verify = root.querySelector('#set-cloud-verify');
    if(verify) verify.addEventListener('click', async function(){
      var old = verify.textContent; verify.disabled = true; verify.textContent = 'Testing…';
      if(vout) vout.textContent = 'Running a cloud save round-trip test…';
      var r = { ok:false, error:'Cloud sync is unavailable in this build.' };
      try { if(window.HearthriseSync && window.HearthriseSync.verifyCloudSave) r = await window.HearthriseSync.verifyCloudSave(); }
      catch(e){ r = { ok:false, error:(e && e.message) || String(e) }; }
      // b301: also report whether the account is active on another device.
      var devLine = '';
      try {
        if(window.HearthriseSync && window.HearthriseSync.checkConcurrentDevice){
          var dev = await window.HearthriseSync.checkConcurrentDevice();
          devLine = dev && dev.concurrent
            ? '\nWARNING: this account is ALSO active on another device — close it to avoid save conflicts.'
            : '\n✓ Only this device is active on your account.';
        }
      } catch(e){}
      verify.textContent = old; verify.disabled = false;
      if(!vout) return;
      if(r.ok){
        vout.textContent = '✓ Cloud save verified — your progress uploaded and read back correctly.' + devLine;
      } else {
        var lines = ['✗ ' + (r.error || 'Cloud save could not be verified.')];
        (r.checks || []).forEach(function(c){
          lines.push((c.match ? '✓ ' : '✗ ') + c.label + ': cloud ' + c.cloud + ' / local ' + c.local);
        });
        vout.textContent = lines.join('\n') + devLine;
      }
    });

    // ── Theme picker ──
    root.querySelectorAll('[data-theme-id]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-theme-id');
        if(window.HearthriseTheme && window.HearthriseTheme.setTheme) window.HearthriseTheme.setTheme(id);
      });
    });

    // ── Beta tester buttons ──
    var bugBtn = root.querySelector('#set-bug-report');
    if(bugBtn) bugBtn.addEventListener('click', function(){
      if(window.HearthriseBugReport && window.HearthriseBugReport.open) window.HearthriseBugReport.open();
    });
    var clBtn = root.querySelector('#set-show-changelog');
    if(clBtn) clBtn.addEventListener('click', function(){
      if(window.HearthriseWelcome && window.HearthriseWelcome.force) window.HearthriseWelcome.force();
    });

    // ── Live cloud auth (email/password via Supabase) ──
    function openAuthFlow(mode){
      // The auth modal already exists in src/net/auth.js. We trigger it by
      // dispatching a synthetic click on any "Sign in" button on the page,
      // or fall back to a direct call if HearthriseAuth exposes one.
      var existing = document.querySelector('button[data-hr-auth-trigger]');
      if(existing){ existing.click(); return; }
      // Build a one-off button that auth.js will patch on next renderAuthUi tick,
      // OR call signIn/signUp directly via a tiny inline modal we render here.
      showInlineAuthModal(mode);
    }
    var btnSignIn = root.querySelector('#set-cloud-signin');
    if(btnSignIn) btnSignIn.addEventListener('click', function(){ openAuthFlow('signin'); });
    var btnSignUp = root.querySelector('#set-cloud-signup');
    if(btnSignUp) btnSignUp.addEventListener('click', function(){ openAuthFlow('signup'); });
    var btnCloudOut = root.querySelector('#set-cloud-signout');
    if(btnCloudOut) btnCloudOut.addEventListener('click', async function(){
      var ok = await ask({ title:'Sign out of your cloud account?',
        body:'Your save stays on this device — sign back in any time to resume cloud sync.',
        confirmLabel:'Sign out', danger:true });
      if(!ok) return;
      try {
        if(window.HearthriseAuth && window.HearthriseAuth.signOut){ await window.HearthriseAuth.signOut(); }
        if(typeof window.notify === 'function') window.notify('Signed out.', 'info');
        if(typeof window.renderSettings === 'function') window.renderSettings();
        /* b318: signing out PARKS the local save (see auth.js signOut), so this
           page is now running a character it can no longer persist. Reload so the
           account wall re-engages on a clean state — otherwise the player keeps
           playing a session whose progress is deliberately no longer written. */
        setTimeout(function(){ try{ location.reload(); }catch(e){} }, 700);
      } catch(e){
        if(typeof window.notify === 'function') window.notify('Sign-out failed: ' + (e.message || e), 'warn');
      }
    });

    // ── Cloud setup (Supabase config) ──
    var sbConnect = root.querySelector('#set-sb-connect');
    if(sbConnect) sbConnect.addEventListener('click', async function(){
      var url = (root.querySelector('#set-sb-url').value || '').trim();
      var key = (root.querySelector('#set-sb-key').value || '').trim();
      if(!url || !key){
        if(typeof window.notify === 'function') window.notify('Both URL and anon key are required.', 'kill');
        return;
      }
      if(!window.HearthriseSupabase){
        if(typeof window.notify === 'function') window.notify('Supabase bootstrap not loaded — try a hard refresh.', 'kill');
        return;
      }
      sbConnect.disabled = true;
      sbConnect.textContent = 'Connecting…';
      try {
        var r = await window.HearthriseSupabase.configure({ url: url, anonKey: key });
        if(!r.ok){
          if(typeof window.notify === 'function') window.notify(r.reason || 'Connect failed', 'kill');
          sbConnect.disabled = false;
          sbConnect.textContent = 'Connect';
          return;
        }
        if(typeof window.notify === 'function'){
          window.notify(r.requiresReload
            ? 'Cloud config updated — reload to apply.'
            : 'Cloud connected. Sign in to start syncing.',
            'levelup');
        }
        // Reload after a short pause so the user sees the toast
        if(r.requiresReload) setTimeout(function(){ location.reload(); }, 1200);
        else window.openSettings();
      } catch(e){
        if(typeof window.notify === 'function') window.notify('Connect error: ' + e.message, 'kill');
        sbConnect.disabled = false;
        sbConnect.textContent = 'Connect';
      }
    });
    var sbDisconnect = root.querySelector('#set-sb-disconnect');
    if(sbDisconnect) sbDisconnect.addEventListener('click', function(){
      ask({ title:'Disconnect from cloud?',
        body:'Your save will stay on this device, but cloud sync, leaderboards and live chat will stop.',
        confirmLabel:'Disconnect', danger:true }).then(function(ok){
        if(!ok) return;
        if(window.HearthriseSupabase) window.HearthriseSupabase.reset();
        if(typeof window.notify === 'function') window.notify('Disconnected. Reload to apply.', 'info');
        setTimeout(function(){ location.reload(); }, 1000);
      });
    });

    /* Tutorial replay.
       b371 (F23) — the live audit filed this as "does nothing". I could not
       reproduce it: driven in a real browser at HEAD the row resets the flag,
       builds `.ftue-root`, shows `.ftue-card.show` at z-index 99999 and is the
       topmost element at screen centre ("Step 1 of 6 · Welcome to Hearthrise").
       Reported as NOT REPRODUCED rather than "fixed".
       What IS true is that the row was SILENT: it closed Settings and left the
       player looking at the game, so any failure of the tour to appear — a
       module that did not load, an exception inside startFTUE — was
       indistinguishable from the button being dead, which is exactly the
       report. It now says so when the tour does not mount. A control with no
       failure state cannot be told apart from a control with no handler. */
    var tut = root.querySelector('#set-replay-tutorial');
    if(tut) tut.addEventListener('click', function(){
      if(typeof window.startFTUE !== 'function'){
        if(typeof window.notify === 'function') window.notify('The tutorial could not be started.', 'kill');
        return;
      }
      if(typeof window.resetFTUE === 'function') window.resetFTUE();
      try { window.startFTUE(); }
      catch(e){
        if(typeof window.notify === 'function') window.notify('The tutorial could not be started.', 'kill');
        return;
      }
      var m = document.getElementById('settings-modal');
      if(m) m.classList.remove('show');
      /* startFTUE renders its first step on a 50ms timer, so the check has to
         outlive it. If nothing mounted, say so instead of leaving the player on
         a closed dialog wondering whether they missed something. */
      setTimeout(function(){
        if(document.querySelector('.ftue-root .ftue-card')) return;
        if(typeof window.notify === 'function') window.notify('The tutorial could not be started.', 'kill');
      }, 600);
    });

    // Block list
    var bl = root.querySelector('#set-show-blocklist');
    if(bl) bl.addEventListener('click', function(){ showBlockList(); });

    // Data controls
    var sn = root.querySelector('#set-save-now');
    if(sn) sn.addEventListener('click', function(){
      if(typeof window.saveLocal === 'function') window.saveLocal();
      if(typeof window.notify === 'function') window.notify('Saved.', 'info');
    });
    var ex = root.querySelector('#set-export');
    if(ex) ex.addEventListener('click', exportSave);
    var im = root.querySelector('#set-import');
    if(im) im.addEventListener('click', importSave);
    var rs = root.querySelector('#set-reset');
    if(rs) rs.addEventListener('click', function(){
      ask({ title:'Erase this character\'s save?',
        body:'The active character\'s save is deleted and the game reloads. Other character slots are NOT affected.',
        confirmLabel:'Erase', danger:true }).then(function(ok){
        if(!ok) return;
        try {
          var SAVE_KEY = 'hearthbound-save-v2';
          localStorage.removeItem(SAVE_KEY);
        } catch(e){}
        location.reload();
      });
    });
    root.querySelectorAll('[data-restore]').forEach(function(b){
      b.addEventListener('click', async function(){
        var key = b.getAttribute('data-restore');
        var ver = key.replace('hearthrise:save-backup:', '');
        var ok = await ask({ title:'Restore from backup ' + ver + '?',
          body:'This overwrites your current save and reloads the game.\n\nA snapshot of your CURRENT save is auto-created at "hearthrise:save-backup:pre-restore" so you can roll back.',
          confirmLabel:'Restore', danger:true });
        if(!ok) return;
        // Auto-snapshot the current save first so the restore is reversible.
        try {
          var SAVE_KEY = 'hearthbound-save-v2';
          var current = localStorage.getItem(SAVE_KEY);
          if(current) localStorage.setItem('hearthrise:save-backup:pre-restore', current);
        } catch(e){
          var anyway = await ask({ title:'Restore without a rollback point?',
            body:'Couldn\'t auto-snapshot your current save (' + e.message + '). Restoring now cannot be undone.',
            confirmLabel:'Restore anyway', danger:true });
          if(!anyway) return;
        }
        if(typeof window.restoreSaveBackup === 'function'){
          window.restoreSaveBackup(key);
          location.reload();
        }
      });
    });
  }

  // ── Block list modal ───────────────────────────────────────
  function showBlockList(){
    var blocked = [];
    try { blocked = JSON.parse(localStorage.getItem('hearthrise:chat:blocked') || '[]'); } catch(e){}
    var html = blocked.length
      ? blocked.map(function(id){
          return '<div class="ss-backup-row">'
               +   '<span>' + esc(id) + '</span>'
               +   '<button class="btn btn-sm" data-unblock="' + esc(id) + '">Unblock</button>'
               + '</div>';
        }).join('')
      : '<div class="ss-hint">You haven\'t blocked anyone.</div>';
    var modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'blocklist-modal';
    modal.innerHTML = ''
      + '<div class="modal-card">'
      +   '<div class="modal-head">'
      +     '<div class="modal-title">Block list</div>'
      +     '<button class="btn btn-sm" id="bl-close">Close</button>'
      +   '</div>'
      +   '<div class="ss-backup-list">' + html + '</div>'
      + '</div>';
    document.body.appendChild(modal);
    modal.querySelector('#bl-close').addEventListener('click', function(){
      modal.parentNode.removeChild(modal);
    });
    modal.querySelectorAll('[data-unblock]').forEach(function(b){
      b.addEventListener('click', function(){
        var id = b.getAttribute('data-unblock');
        if(window.Chat && typeof window.Chat.unblock === 'function') window.Chat.unblock(id);
        modal.parentNode.removeChild(modal);
        showBlockList();
      });
    });
  }

  // ── Export / import ────────────────────────────────────────
  function exportSave(){
    try {
      var SAVE_KEY = 'hearthbound-save-v2';
      var raw = localStorage.getItem(SAVE_KEY) || '{}';
      var blob = new Blob([raw], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'hearthrise-save-' + new Date().toISOString().slice(0,10) + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    } catch(e){
      if(typeof window.notify === 'function') window.notify('Export failed: ' + e.message, 'kill');
    }
  }
  function importSave(){
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', function(){
      var f = input.files && input.files[0];
      if(!f) return;
      var reader = new FileReader();
      reader.onload = async function(){
        try {
          var parsed = JSON.parse(reader.result);
          if(typeof parsed !== 'object') throw new Error('Not a save file.');
          var ok = await ask({ title:'Replace your save with the imported one?',
            body:'This cannot be undone unless you have a backup.',
            confirmLabel:'Import', danger:true });
          if(!ok) return;
          /* b372: an imported file may have been exported from a DIFFERENT hero
             slot, and loadLocal now parks a save stamped for another slot. This
             is an explicit, confirmed player action, so the blob is un-stamped
             and claimed by whichever character it is being imported into. */
          try { delete parsed._saveSlot; } catch(e){}
          localStorage.setItem('hearthbound-save-v2', JSON.stringify(parsed));
          location.reload();
        } catch(e){
          say({ title:'Import failed', body: String(e.message || e) });
        }
      };
      reader.readAsText(f);
    });
    input.click();
  }

  // ── The big one — replace openSettings ─────────────────────
  function openSettings(){
    ensureSettings();
    var m = document.getElementById('settings-modal');
    var body = document.getElementById('settings-body');
    if(!m || !body){
      // Shouldn't happen but bail safely
      console.warn('[settings] modal not present');
      return;
    }
    body.innerHTML = ''
      + '<div class="settings-page">'
      +   renderSection(true,  'Audio',          audioHtml())
      +   renderSection(false, 'Display',        displayHtml())
      +   renderSection(false, 'Gameplay',       gameplayHtml())
      +   renderSection(false, 'Chat & Privacy', chatHtml())
      +   renderSection(false, 'Account',         accountHtml())
      +   renderSection(false, 'Data',            dataHtml())
      + '</div>';
    bindControls(body);
    m.classList.add('show');
  }

  // Override the legacy openSettings — preserve a reference for fallback.
  var prev = window.openSettings;
  window.openSettings = openSettings;
  window._legacyOpenSettings = prev || null;

  /* The one pure rule in this file, published so the suite can assert it
     without opening a modal and walking 900 lines of generated HTML. The
     away warning on the toggle's OFF state and the dial's 0% end is a BINDING
     condition of arming the auto-eat ON/OFF sync (Designer ruling 2b,
     2026-08-31), so it needs a test that fails when the copy is dropped —
     SETTINGS-AUTOEAT-1. Nothing else here is worth a seam; the rest is
     rendering. */
  window.HearthriseSettingsPage = { _autoEatHint: autoEatHint };

  console.log('[settings] page rebuilt — 6 sections active');
})();
