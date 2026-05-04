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
    if(typeof d.scale         !== 'string')  d.scale         = 'auto';
    if(typeof d.theme         !== 'string')  d.theme         = 'dark';
    if(typeof d.showDamage    !== 'boolean') d.showDamage    = true;
    if(typeof d.autoEatPct    !== 'number')  d.autoEatPct    = (G.autoEatPct != null ? G.autoEatPct : 0.5);
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function pct(n){ return Math.round(n * 100) + '%'; }

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
    var inviteRow = isSignUp
      ? '<input type="text" name="invite" placeholder="Beta invite code (e.g. FRIEND-001)" required style="padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:13px;text-transform:uppercase;letter-spacing:1px" />'
      : '';
    var nameRow = isSignUp
      ? '<input type="text" name="displayName" placeholder="Your name (in-game + leaderboards)" required maxlength="20" style="padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:13px" />'
      : '';
    overlay.innerHTML = ''
      + '<form style="background:#1a1f2e;border:2px solid #f3d181;border-radius:8px;padding:20px;max-width:380px;width:100%;display:flex;flex-direction:column;gap:10px;color:#dfe9ee;font-family:system-ui,sans-serif">'
      +   '<h3 style="margin:0;color:#f3d181">' + (isSignUp ? 'Create your Hearthrise account' : 'Sign in to Hearthrise') + '</h3>'
      +   '<p style="margin:0;font-size:12px;color:#9aa3b0">' + (isSignUp
              ? 'Closed beta — you\'ll need an invite code from Tyler. Your local progress will move to the cloud automatically.'
              : 'Sync your save, join clans, climb leaderboards.') + '</p>'
      +   inviteRow
      +   nameRow
      +   '<input type="email" name="email" placeholder="Email" required style="padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:13px" />'
      +   '<input type="password" name="password" placeholder="Password (8+ characters)" required minlength="8" style="padding:8px 12px;background:#0f1320;border:1px solid #2a3142;color:#dfe9ee;border-radius:4px;font-size:13px" />'
      +   '<div style="display:flex;gap:8px;margin-top:4px">'
      +     '<button type="submit" data-act="primary" style="flex:1;padding:9px;background:#f3d181;color:#0f1320;border:none;border-radius:4px;font-weight:700;cursor:pointer">'
      +       (isSignUp ? 'Create account' : 'Sign in')
      +     '</button>'
      +   '</div>'
      +   '<button type="button" data-act="toggle" style="padding:6px;background:transparent;color:#9aa3b0;border:none;cursor:pointer;font-size:12px;text-decoration:underline">'
      +     (isSignUp ? 'Already have an account? Sign in' : 'New here? Create an account')
      +   '</button>'
      +   '<button type="button" data-act="cancel" style="padding:6px;background:transparent;color:#9aa3b0;border:1px solid #2a3142;border-radius:4px;cursor:pointer;font-size:11px">Cancel · Continue offline</button>'
      +   '<div data-status style="font-size:11px;color:#e88a8a;min-height:14px;text-align:center"></div>'
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
    form.addEventListener('submit', async function(e){
      e.preventDefault();
      var email = (form.email.value || '').trim();
      var password = form.password.value || '';
      var invite = isSignUp ? ((form.invite && form.invite.value || '').trim().toUpperCase()) : null;
      var displayName = isSignUp ? ((form.displayName && form.displayName.value || '').trim()) : null;
      if(!email || !password){ status.textContent = 'Email and password required.'; return; }
      if(isSignUp){
        if(!invite){ status.textContent = 'Beta invite code required.'; return; }
        if(!displayName){ status.textContent = 'Pick a name.'; return; }
        if(displayName.length < 2){ status.textContent = 'Name too short.'; return; }
      }
      status.style.color = '#9aa3b0';
      status.textContent = isSignUp ? 'Creating account…' : 'Signing in…';
      try {
        if(isSignUp){
          // Pre-validate invite code so we don't create an account that can't claim one
          var validated = await validateInvite(invite);
          if(!validated.ok){
            status.style.color = '#e88a8a';
            status.textContent = validated.reason || 'Invalid invite code.';
            return;
          }
          // Pass display_name as user metadata — picked up by the
          // handle_new_user trigger to set profiles.display_name on
          // first row creation.
          await auth.signUp(email, password, { display_name: displayName });
          // Stash the invite code + display name for post-signin pickup
          try {
            localStorage.setItem('hearthrise:pending-invite', invite);
            localStorage.setItem('hearthrise:pending-name', displayName);
          } catch(e){}
          // Set the in-game player name immediately so the offline guest
          // session reflects the chosen name even before email confirm.
          if(window.G){
            window.G.playerName = displayName;
            if(typeof window.saveLocal === 'function') window.saveLocal();
            if(typeof window.render === 'function') window.render();
          }
          status.style.color = '#5fcc7c';
          status.textContent = '✓ Check your inbox for a confirmation email.';
          setTimeout(function(){ close(); if(typeof window.renderSettings === 'function') window.renderSettings(); }, 2200);
        } else {
          await auth.signIn(email, password);
          // Claim a pending invite + apply pending name if there is one
          await claimPendingInvite();
          var pendingName = null;
          try { pendingName = localStorage.getItem('hearthrise:pending-name'); } catch(e){}
          if(pendingName && window.G){
            window.G.playerName = pendingName;
            if(typeof window.saveLocal === 'function') window.saveLocal();
            try { localStorage.removeItem('hearthrise:pending-name'); } catch(e){}
          }
          status.style.color = '#5fcc7c';
          status.textContent = '✓ Signed in. Syncing your save…';
          setTimeout(function(){ close(); if(typeof window.renderSettings === 'function') window.renderSettings(); }, 800);
        }
      } catch(err){
        status.style.color = '#e88a8a';
        status.textContent = (err && err.message) ? err.message : 'Something went wrong.';
      }
    });

    // ── Invite code helpers ──
    async function validateInvite(code){
      var cfg = window.HearthriseSupabase && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig();
      if(!cfg) return { ok: false, reason: 'Cloud not configured.' };
      try {
        var res = await fetch(cfg.url + '/rest/v1/beta_invites?code=eq.' + encodeURIComponent(code) + '&select=code,used_by', {
          headers: { 'apikey': cfg.anonKey, 'Authorization': 'Bearer ' + cfg.anonKey },
        });
        if(!res.ok) return { ok: false, reason: 'Could not check code.' };
        var rows = await res.json();
        if(!rows.length) return { ok: false, reason: 'Invalid invite code.' };
        if(rows[0].used_by) return { ok: false, reason: 'Code already used.' };
        return { ok: true };
      } catch(e){
        return { ok: false, reason: 'Network error.' };
      }
    }
    async function claimPendingInvite(){
      var pending = null;
      try { pending = localStorage.getItem('hearthrise:pending-invite'); } catch(e){}
      if(!pending) return;
      var cfg = window.HearthriseSupabase && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig();
      var session = window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession();
      if(!cfg || !session) return;
      try {
        await fetch(cfg.url + '/rest/v1/rpc/claim_beta_invite', {
          method: 'POST',
          headers: {
            'apikey': cfg.anonKey,
            'Authorization': 'Bearer ' + session.access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code_in: pending }),
        });
        localStorage.removeItem('hearthrise:pending-invite');
      } catch(e){}
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
    var scaleOpts = [
      ['auto','Auto'], ['90','90%'], ['100','100%'], ['110','110%'], ['125','125%'], ['150','150%'],
    ];
    // Theme picker — driven by HearthriseTheme (theme-picker.js).
    var current = (window.HearthriseTheme && window.HearthriseTheme.getTheme && window.HearthriseTheme.getTheme()) || 'cozy-light';
    var themes = (window.HearthriseTheme && window.HearthriseTheme.list && window.HearthriseTheme.list()) || [
      { id:'cozy-light', label:'Cozy Day', desc:'' },
      { id:'cozy-dark',  label:'Cozy Night', desc:'' },
      { id:'classic',    label:'Classic', desc:'' },
    ];
    var themeCards = themes.map(function(t){
      var active = (t.id === current);
      return ''
        + '<button class="btn btn-sm ss-theme-card' + (active ? ' active' : '') + '" '
        +   'data-theme-id="' + esc(t.id) + '" '
        +   'style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;flex:1;text-align:left;padding:10px 12px;'
        +   (active ? 'border-color:var(--gold);background:var(--gold-bg);' : '') + '">'
        +   '<span style="font-weight:700;font-size:13px">' + esc(t.label) + (active ? ' ✓' : '') + '</span>'
        +   '<span style="font-size:11px;opacity:.75">' + esc(t.desc) + '</span>'
        + '</button>';
    }).join('');
    return ''
      + selectRow('UI scale', 'scale', d.scale, scaleOpts)
      + '<div class="ss-row" style="flex-direction:column;align-items:stretch;gap:8px"><div class="ss-label">Theme</div>'
      +   '<div style="display:flex;gap:8px;flex-wrap:wrap">' + themeCards + '</div>'
      + '</div>'
      + row('Reduce motion / visual effects', toggle('reduceFx', d.reduceFx))
      + row('Show damage numbers', toggle('showDamage', d.showDamage));
  }

  // ── Gameplay ───────────────────────────────────────────────
  function gameplayHtml(){
    var d = window.G.settings;
    return ''
      + row('Left-handed mode (mobile)', toggle('leftHand', d.leftHand))
      + sliderRow('Auto-eat HP threshold', 'autoEatPct', d.autoEatPct, 0, 1, 0.05, pct(d.autoEatPct), 'Eat food automatically when HP drops below this percentage.')
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
      auth = ''
        + '<div class="ss-card">'
        +   '<div class="ss-card-title">' + esc(liveSession.user.email || 'Signed in') + '</div>'
        +   '<div class="ss-card-meta">☁️ Cloud save active · syncing every 30s</div>'
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
          +   '<div class="ss-card-title">Play across devices</div>'
          +   '<div class="ss-card-meta">Sign in to sync your save, join clans, and post to global chat. Free, takes 30 seconds.</div>'
          +   '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">'
          +     '<button class="btn btn-sm btn-primary" id="set-cloud-signin">Sign in</button>'
          +     '<button class="btn btn-sm" id="set-cloud-signup">Create account</button>'
          +   '</div>'
          +   '<div class="ss-hint" style="margin-top:8px">Don\'t want an account? You can keep playing offline — your save lives on this device.</div>'
          + '</div>')
        : ('<div class="ss-card">'
          +   '<div class="ss-card-title">Offline play</div>'
          +   '<div class="ss-card-meta">Cloud features aren\'t live in this build. Your save lives on this device.</div>'
          + '</div>');
    }
    var cloudMeta = G.cloudSyncedAt
      ? 'Last synced: ' + new Date(G.cloudSyncedAt).toLocaleString()
      : 'Never synced.';

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
      +   '<div class="ss-card-title">☁️ Cloud setup (developer)</div>'
      +   '<div class="ss-card-meta">' + (hasCloud
              ? 'Connected to ' + esc(sbConfig.url.replace(/^https?:\/\//, ''))
              : 'Self-hoster paste form. Production builds ship with credentials baked in.') + '</div>'
      +   '<div class="ss-row" style="margin-top:8px"><div class="ss-label">Supabase URL</div>'
      +     '<input type="text" id="set-sb-url" placeholder="https://xxxx.supabase.co" value="' + esc(sbConfig.url || '') + '" />'
      +   '</div>'
      +   '<div class="ss-row"><div class="ss-label">Anon key</div>'
      +     '<input type="text" id="set-sb-key" placeholder="eyJhbG..." value="' + esc(sbConfig.anonKey || '') + '" style="font-family:monospace;font-size:11px" />'
      +   '</div>'
      +   '<div class="ss-row" style="justify-content:flex-end;gap:8px">'
      +     (hasCloud ? '<button class="btn btn-sm btn-danger" id="set-sb-disconnect">Disconnect</button>' : '')
      +     '<button class="btn btn-sm" id="set-sb-connect">' + (hasCloud ? 'Update' : 'Connect') + '</button>'
      +   '</div>'
      +   '<div class="ss-hint">See <code>src/net/SUPABASE_SETUP.md</code> for the schema setup. Anon keys are public by design.</div>'
      + '</div>';

    // ── Beta tester block — discord, bug report, build version, what's new ──
    var DISCORD_INVITE = 'https://discord.gg/your-invite-here'; // Tyler: replace with real invite
    var build = (window.HearthriseBuild && window.HearthriseBuild.buildString && window.HearthriseBuild.buildString()) || 'unknown';
    var beta = ''
      + '<div class="ss-card" style="display:block">'
      +   '<div class="ss-card-title">🧪 Beta tester tools</div>'
      +   '<div class="ss-card-meta">Found a bug? See something off? Send it our way.</div>'
      +   '<div class="ss-row" style="margin-top:8px;gap:6px;flex-wrap:wrap">'
      +     '<button class="btn btn-sm" id="set-bug-report">🐛 Report bug</button>'
      +     '<button class="btn btn-sm" id="set-show-changelog">📜 What\'s new</button>'
      +     '<a class="btn btn-sm" href="' + esc(DISCORD_INVITE) + '" target="_blank" rel="noopener" style="text-decoration:none">💬 Discord</a>'
      +   '</div>'
      +   '<div class="ss-hint" style="margin-top:8px">Build <code>' + esc(build) + '</code></div>'
      + '</div>';

    return ''
      + nameInput
      + auth
      + '<div class="ss-row"><div class="ss-label">Cloud sync</div>'
      +   '<button class="btn btn-sm" id="set-cloud-sync">Sync now</button>'
      + '</div>'
      + '<div class="ss-hint">' + esc(cloudMeta) + '</div>'
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
      +   '<button class="btn btn-sm" id="set-save-now">💾 Save</button>'
      + '</div>'
      + '<div class="ss-row"><div class="ss-label">Export save</div>'
      +   '<button class="btn btn-sm" id="set-export">⬇️ Download JSON</button>'
      + '</div>'
      + '<div class="ss-row"><div class="ss-label">Import save</div>'
      +   '<button class="btn btn-sm" id="set-import">📂 From file…</button>'
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
      +   '<button class="btn btn-sm btn-danger" id="set-reset">⚠️ Erase + reload</button>'
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
  function sliderRow(label, key, value, min, max, step, displayValue, hint){
    return '<div class="ss-row">'
      +     '<div class="ss-label">' + esc(label) + '</div>'
      +     '<div class="ss-slider">'
      +       '<input type="range" data-set="' + esc(key) + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '" />'
      +       '<span class="ss-slider-value">' + esc(displayValue) + '</span>'
      +     '</div>'
      +   '</div>'
      + (hint ? '<div class="ss-hint">' + esc(hint) + '</div>' : '');
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
          window.G.autoEatPct = v;
        }
        if(typeof window.saveLocal === 'function') window.saveLocal();
        // Update visible slider value
        if(el.type === 'range'){
          var disp = el.parentElement.querySelector('.ss-slider-value');
          if(disp) disp.textContent = pct(v);
        }
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
    var saveName = root.querySelector('#set-name-save');
    if(saveName) saveName.addEventListener('click', function(){
      var v = (root.querySelector('#set-display-name').value || '').trim().slice(0, 20);
      if(!v) return;
      window.G.playerName = v;
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
    var cloud = root.querySelector('#set-cloud-sync');
    if(cloud) cloud.addEventListener('click', function(){
      if(typeof window.cloudSync === 'function') window.cloudSync();
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
      if(!confirm('Sign out of your cloud account? Your save stays on this device — sign back in any time to resume cloud sync.')) return;
      try {
        if(window.HearthriseAuth && window.HearthriseAuth.signOut){ await window.HearthriseAuth.signOut(); }
        if(typeof window.notify === 'function') window.notify('Signed out.', 'info');
        if(typeof window.renderSettings === 'function') window.renderSettings();
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
      if(!confirm('Disconnect from cloud? Your save will stay on this device but cloud sync, leaderboards, and live chat will stop.')) return;
      if(window.HearthriseSupabase) window.HearthriseSupabase.reset();
      if(typeof window.notify === 'function') window.notify('Disconnected. Reload to apply.', 'info');
      setTimeout(function(){ location.reload(); }, 1000);
    });

    // Tutorial replay
    var tut = root.querySelector('#set-replay-tutorial');
    if(tut) tut.addEventListener('click', function(){
      if(typeof window.resetFTUE === 'function') window.resetFTUE();
      if(typeof window.startFTUE === 'function') window.startFTUE();
      var m = document.getElementById('settings-modal');
      if(m) m.classList.remove('show');
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
      if(!confirm('Erase the active character\'s save and reload?\n\nOther character slots are NOT affected.')) return;
      try {
        var SAVE_KEY = 'hearthbound-save-v2';
        localStorage.removeItem(SAVE_KEY);
      } catch(e){}
      location.reload();
    });
    root.querySelectorAll('[data-restore]').forEach(function(b){
      b.addEventListener('click', function(){
        var key = b.getAttribute('data-restore');
        var ver = key.replace('hearthrise:save-backup:', '');
        if(!confirm('Restore from backup ' + ver + '?\n\nThis will overwrite your current save and reload the game.\n\nA snapshot of your CURRENT save will be auto-created at\n"hearthrise:save-backup:pre-restore"\nso you can roll back if needed.')) return;
        // Auto-snapshot the current save first so the restore is reversible.
        try {
          var SAVE_KEY = 'hearthbound-save-v2';
          var current = localStorage.getItem(SAVE_KEY);
          if(current) localStorage.setItem('hearthrise:save-backup:pre-restore', current);
        } catch(e){
          if(!confirm('Couldn\'t auto-snapshot your current save (' + e.message + '). Restore anyway?')) return;
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
      reader.onload = function(){
        try {
          var parsed = JSON.parse(reader.result);
          if(typeof parsed !== 'object') throw new Error('Not a save file.');
          if(!confirm('Replace your current save with the imported one? This cannot be undone unless you have a backup.')) return;
          localStorage.setItem('hearthbound-save-v2', JSON.stringify(parsed));
          location.reload();
        } catch(e){
          alert('Import failed: ' + e.message);
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
      +   renderSection(true,  '🔊 Audio',          audioHtml())
      +   renderSection(false, '🖥️ Display',        displayHtml())
      +   renderSection(false, '🎮 Gameplay',       gameplayHtml())
      +   renderSection(false, '💬 Chat & Privacy', chatHtml())
      +   renderSection(false, '👤 Account',         accountHtml())
      +   renderSection(false, '💾 Data',            dataHtml())
      + '</div>';
    bindControls(body);
    m.classList.add('show');
  }

  // Override the legacy openSettings — preserve a reference for fallback.
  var prev = window.openSettings;
  window.openSettings = openSettings;
  window._legacyOpenSettings = prev || null;

  console.log('[settings] page rebuilt — 6 sections active');
})();
