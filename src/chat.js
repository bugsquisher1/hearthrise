// ============================================================
// src/chat.js
//
// In-game chat with tabs, @mentions, click-to-DM, profanity
// filter, mute, and block list.
//
// Design goals:
//   • Discord-shaped UX. Players know how chat should work; we
//     copy what's familiar.
//   • Polished — never the chat system that gets shipped because
//     a chat system was on the spec sheet. Tabs animate in, the
//     dock minimizes to a count bubble, mentions glow.
//   • Pluggable backend. Local mode (localStorage) is enough for
//     soft beta and for the player to keep notes-to-self. Phase 2
//     swaps in Supabase Realtime — the public API on `backend`
//     stays the same, only the implementation changes.
//   • Privacy-respectful. Whisper permission is opt-in narrowing
//     (everyone / clan / no one). Block list is honored locally.
//   • Profanity filter on by default, off via Settings → Chat.
//
// Production roadmap (Phase 2):
//   The Supabase backend is sketched at the bottom of this file
//   in comments. Schemas:
//
//     create table chat_messages (
//       id          uuid primary key default gen_random_uuid(),
//       channel     text not null,                 -- 'global' | 'trade' | 'clan:<id>' | 'whisper:<a>:<b>'
//       from_id     uuid not null references profiles(id),
//       from_name   text not null,
//       body        text not null check (length(body) between 1 and 240),
//       mentions    uuid[] default '{}',
//       created_at  timestamptz default now()
//     );
//     create index on chat_messages (channel, created_at desc);
//     create policy "global readable by anyone" on chat_messages
//       for select using (channel in ('global', 'trade'));
//     create policy "clan readable by members" on chat_messages
//       for select using (
//         channel like 'clan:%'
//         and substring(channel from 6) in (select clan_id from profiles where id = auth.uid())
//       );
//     create policy "whisper readable by participants" on chat_messages
//       for select using (
//         channel like 'whisper:%'
//         and auth.uid()::text in (
//           split_part(substring(channel from 9), ':', 1),
//           split_part(substring(channel from 9), ':', 2)
//         )
//       );
//
//   Use Supabase Realtime channels to receive new messages
//   instead of polling.
//
// Public API (devtools):
//   window.Chat.toggle()             — show/hide the dock
//   window.Chat.send('global', txt)  — programmatic send
//   window.Chat.openWhisper(id, name)— open whisper tab to a player
//   window.Chat.block(id)            — block a player
//   window.Chat.unblock(id)
//   window.Chat.setBackend(impl)     — swap backend (Phase 2)
// ============================================================

(function(){
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  var STATE_KEY      = 'hearthrise:chat:state';
  var MSG_KEY_PREFIX = 'hearthrise:chat:msgs:';
  var SETTINGS_KEY   = 'hearthrise:chat:settings';
  var BLOCK_KEY      = 'hearthrise:chat:blocked';
  var MAX_MSG_LEN    = 240;
  var MSG_CAP        = 200;          // per channel, FIFO
  var SEND_THROTTLE  = 800;          // ms between sends from same player
  var DEFAULT_CHANNELS = [
    { id:'global', label:'Global', icon:'🌐' },
    { id:'trade',  label:'Trade',  icon:'💰' },
    { id:'clan',   label:'Clan',   icon:'🛡️' },
  ];

  // ── Settings ────────────────────────────────────────────────
  var defaultSettings = {
    profanityFilter:   true,
    showTimestamps:    true,
    soundOnMention:    true,
    whisperPermission: 'all',         // 'all' | 'clan' | 'none'
    minimized:         true,           // start collapsed so we don't take over the screen
  };
  function loadSettings(){
    try { return Object.assign({}, defaultSettings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
    catch(e){ return Object.assign({}, defaultSettings); }
  }
  function saveSettings(){
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch(e){}
  }
  var settings = loadSettings();
  // b106: on mobile widths, force the dock to start minimized regardless
  // of any saved preference. The dock is full-screen-overlay on phones,
  // so an expanded default would cover the entire game on first load —
  // which is what mobile testers reported as "the game is broken."
  // Users can still expand by tapping the Chat pill; their preference
  // resaves to localStorage normally after that.
  if (typeof window !== 'undefined' && window.innerWidth <= 540) {
    settings.minimized = true;
  }

  // ── Block list ──────────────────────────────────────────────
  function loadBlocked(){
    try { return JSON.parse(localStorage.getItem(BLOCK_KEY) || '[]'); } catch(e){ return []; }
  }
  function saveBlocked(){
    try { localStorage.setItem(BLOCK_KEY, JSON.stringify(blocked)); } catch(e){}
  }
  var blocked = loadBlocked();

  // ── State ───────────────────────────────────────────────────
  function loadState(){
    try {
      var raw = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
      return {
        active: raw.active || 'global',
        whispers: raw.whispers || {},      // { otherId: { name, lastSeen } }
        unread:   raw.unread   || {},      // { channelId: count }
      };
    } catch(e){
      return { active:'global', whispers:{}, unread:{} };
    }
  }
  function saveState(){
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        active: state.active,
        whispers: state.whispers,
        unread: state.unread,
      }));
    } catch(e){}
  }
  var state = loadState();

  // ── Identity helpers (read from G or fallback) ─────────────
  function me(){
    var G = window.G || {};
    var profile = window.HearthriseProfile && window.HearthriseProfile.profile;
    // Prefer the live Supabase session user id — it's a real UUID and the
    // chat_messages table requires it. Fall back to profile.id (also a UUID
    // if synced) or finally a local placeholder for offline-only sessions.
    // Without this, signed-in users posted `local-0` to a uuid column and
    // Supabase 400'd the insert ("invalid input syntax for type uuid").
    var liveSession = (window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession()) || null;
    var liveUser = liveSession && liveSession.user;
    var name = (liveUser && (liveUser.user_metadata && liveUser.user_metadata.display_name || (liveUser.email||'').split('@')[0]))
            || G.playerName
            || (profile && profile.displayName)
            || 'Adventurer';
    var id = (liveUser && liveUser.id)
          || (profile && profile.id)
          || ('local-' + (profile && profile.activeSlot != null ? profile.activeSlot : 0));
    return { id: id, name: name };
  }
  function clanOf(){ return (window.G && window.G.clanName) ? window.G.clanName : null; }

  // ════════════════════════════════════════════════════════════
  // BACKEND INTERFACE
  // ════════════════════════════════════════════════════════════
  // A backend implements:
  //   send(channel, msg)        → Promise resolving to the saved msg
  //   fetch(channel, sinceTs)   → Promise resolving to [msg]
  //   subscribe(channel, cb)    → unsubscribe fn; cb gets new msgs
  //
  // The local backend is good enough for soft beta. Production
  // swaps to Supabase via window.Chat.setBackend().
  // ────────────────────────────────────────────────────────────
  function LocalBackend(){
    this._listeners = {};   // channel → [callback]
  }
  LocalBackend.prototype._key = function(channel){ return MSG_KEY_PREFIX + channel; };
  // Use the shared safeLoadJson / safeSaveJson helpers when available
  // (see src/utils/safe.js). Fall back to inline try/catch when not —
  // keeps chat.js loadable even if the utility module is missing.
  LocalBackend.prototype._read = function(channel){
    if(window.HearthriseSafe && typeof window.HearthriseSafe.safeLoadJson === 'function'){
      return window.HearthriseSafe.safeLoadJson(this._key(channel), []);
    }
    try { return JSON.parse(localStorage.getItem(this._key(channel)) || '[]'); }
    catch(e){ return []; }
  };
  LocalBackend.prototype._write = function(channel, msgs){
    var capped = msgs.slice(-MSG_CAP);
    if(window.HearthriseSafe && typeof window.HearthriseSafe.safeSaveJson === 'function'){
      window.HearthriseSafe.safeSaveJson(this._key(channel), capped);
      return;
    }
    try { localStorage.setItem(this._key(channel), JSON.stringify(capped)); }
    catch(e){}
  };
  LocalBackend.prototype.send = function(channel, msg){
    var msgs = this._read(channel);
    msgs.push(msg);
    this._write(channel, msgs);
    var subs = this._listeners[channel] || [];
    subs.forEach(function(cb){ try { cb([msg]); } catch(e){} });
    return Promise.resolve(msg);
  };
  LocalBackend.prototype.fetch = function(channel, sinceTs){
    var msgs = this._read(channel);
    if(sinceTs) msgs = msgs.filter(function(m){ return m.ts > sinceTs; });
    return Promise.resolve(msgs);
  };
  LocalBackend.prototype.subscribe = function(channel, callback){
    if(!this._listeners[channel]) this._listeners[channel] = [];
    this._listeners[channel].push(callback);
    return function unsub(){
      var arr = this._listeners[channel] || [];
      var i = arr.indexOf(callback);
      if(i !== -1) arr.splice(i, 1);
    }.bind(this);
  };
  var backend = new LocalBackend();

  // ── Cache: messages by channel ──────────────────────────────
  // We keep the active channel hot in memory. Other channels are
  // lazily loaded on first switch.
  var cache = {};   // channelId → [msg]
  function loadCache(channel){
    if(cache[channel]) return Promise.resolve(cache[channel]);
    return backend.fetch(channel).then(function(msgs){
      cache[channel] = msgs;
      return msgs;
    });
  }

  // ════════════════════════════════════════════════════════════
  // UI
  // ════════════════════════════════════════════════════════════
  var dockEl, fullEl, minEl, tabsEl, msgsEl, inputEl, mentionPopEl;
  var built = false;
  var unsubFns = [];

  function buildDock(){
    if(built) return;
    built = true;

    dockEl = document.createElement('div');
    dockEl.id = 'chat-dock';
    dockEl.innerHTML = ''
      + '<div id="chat-dock-min">'
      +   '<span class="cdm-icon">💬</span>'
      +   '<span class="cdm-label">Chat</span>'
      +   '<span class="cdm-badge" id="chat-mini-badge" style="display:none">0</span>'
      + '</div>'
      + '<div id="chat-dock-full">'
      +   '<div id="chat-tabs"></div>'
      +   '<div id="chat-messages"></div>'
      +   '<div id="chat-mention-pop" style="display:none"></div>'
      +   '<div id="chat-input-bar">'
      +     '<input id="chat-input" maxlength="' + MAX_MSG_LEN + '" placeholder="Pick a tab…" autocomplete="off" />'
      +     '<button id="chat-send" title="Send">➤</button>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(dockEl);

    fullEl       = document.getElementById('chat-dock-full');
    minEl        = document.getElementById('chat-dock-min');
    tabsEl       = document.getElementById('chat-tabs');
    msgsEl       = document.getElementById('chat-messages');
    inputEl      = document.getElementById('chat-input');
    mentionPopEl = document.getElementById('chat-mention-pop');

    minEl.addEventListener('click', toggleDock);

    document.getElementById('chat-send').addEventListener('click', onSendClick);
    inputEl.addEventListener('keydown', onInputKey);
    inputEl.addEventListener('input', onInputChange);

    // Click-out closes mention pop
    document.addEventListener('click', function(e){
      if(mentionPopEl && !mentionPopEl.contains(e.target) && e.target !== inputEl){
        mentionPopEl.style.display = 'none';
      }
    });

    applyDockState();
  }

  function applyDockState(){
    if(settings.minimized){
      dockEl.classList.add('mini');
      dockEl.classList.remove('full');
    } else {
      dockEl.classList.remove('mini');
      dockEl.classList.add('full');
    }
    renderTabs();
    renderActive();
    updateMiniBadge();
  }

  function toggleDock(){
    settings.minimized = !settings.minimized;
    saveSettings();
    applyDockState();
    if(!settings.minimized){
      // Mark the active channel as read on open
      state.unread[state.active] = 0;
      saveState();
      renderTabs();
      setTimeout(function(){ if(inputEl) inputEl.focus(); }, 200);
    }
  }

  function renderTabs(){
    if(!tabsEl) return;
    var html = '';
    DEFAULT_CHANNELS.forEach(function(ch){
      var unread = state.unread[ch.id] || 0;
      var active = state.active === ch.id ? ' active' : '';
      html += '<button class="chat-tab' + active + '" data-channel="' + ch.id + '">'
           +   '<span class="ct-icon">' + ch.icon + '</span>'
           +   '<span class="ct-label">' + ch.label + '</span>'
           +   (unread ? '<span class="ct-badge">' + unread + '</span>' : '')
           + '</button>';
    });
    // Whisper tabs
    Object.keys(state.whispers).forEach(function(otherId){
      var w = state.whispers[otherId];
      var ch = 'whisper:' + otherId;
      var unread = state.unread[ch] || 0;
      var active = state.active === ch ? ' active' : '';
      html += '<button class="chat-tab whisper' + active + '" data-channel="' + ch + '" title="Whisper with ' + w.name + '">'
           +   '<span class="ct-icon">@</span>'
           +   '<span class="ct-label">' + w.name + '</span>'
           +   (unread ? '<span class="ct-badge">' + unread + '</span>' : '')
           +   '<span class="ct-close" data-close-whisper="' + otherId + '" title="Close">×</span>'
           + '</button>';
    });
    html += '<button id="chat-collapse" class="chat-tab collapse" title="Minimize">−</button>';
    tabsEl.innerHTML = html;

    // Bind tab clicks
    tabsEl.querySelectorAll('.chat-tab[data-channel]').forEach(function(btn){
      btn.addEventListener('click', function(e){
        if(e.target && e.target.classList.contains('ct-close')) return;
        switchChannel(btn.getAttribute('data-channel'));
      });
    });
    tabsEl.querySelectorAll('[data-close-whisper]').forEach(function(x){
      x.addEventListener('click', function(e){
        e.stopPropagation();
        var id = x.getAttribute('data-close-whisper');
        delete state.whispers[id];
        delete state.unread['whisper:' + id];
        if(state.active === 'whisper:' + id) state.active = 'global';
        saveState();
        renderTabs();
        renderActive();
      });
    });
    var coll = document.getElementById('chat-collapse');
    if(coll) coll.addEventListener('click', toggleDock);
  }

  function switchChannel(channel){
    state.active = channel;
    state.unread[channel] = 0;
    saveState();
    renderTabs();
    renderActive();
    updatePlaceholder();
    setTimeout(function(){ if(inputEl) inputEl.focus(); }, 30);
    updateMiniBadge();
  }

  function updatePlaceholder(){
    if(!inputEl) return;
    var ch = state.active;
    if(ch.indexOf('whisper:') === 0){
      var otherId = ch.slice('whisper:'.length);
      var w = state.whispers[otherId];
      inputEl.placeholder = w ? ('Whisper to ' + w.name + '…') : 'Whisper…';
    } else if(ch === 'clan'){
      var c = clanOf();
      inputEl.placeholder = c ? ('Clan chat — ' + c) : 'Join a clan to chat here';
      inputEl.disabled = !c;
    } else {
      inputEl.placeholder = 'Send to ' + (ch.charAt(0).toUpperCase() + ch.slice(1)) + '…';
      inputEl.disabled = false;
    }
  }

  function renderActive(){
    var channel = state.active;
    if(!msgsEl) return;
    msgsEl.innerHTML = '<div class="chat-loading">Loading…</div>';
    loadCache(channel).then(function(msgs){
      renderMessages(channel, msgs);
    });
  }

  function renderMessages(channel, msgs){
    if(state.active !== channel) return;
    if(!msgs || msgs.length === 0){
      msgsEl.innerHTML = '<div class="chat-empty">'
        + ((channel === 'clan' && !clanOf()) ? '🛡️ Join a clan to unlock this channel.' : '✨ No messages yet — be the first.')
        + '</div>';
      return;
    }
    var meId = me().id;
    var html = '';
    msgs.forEach(function(m){
      if(blocked.indexOf(m.fromId) !== -1) return;     // hide blocked
      html += renderMessage(m, meId);
    });
    msgsEl.innerHTML = html;
    msgsEl.scrollTop = msgsEl.scrollHeight;

    // Bind name-click → context menu
    msgsEl.querySelectorAll('[data-from-id]').forEach(function(el){
      el.addEventListener('click', function(e){
        e.stopPropagation();
        showNameMenu(el, el.getAttribute('data-from-id'), el.getAttribute('data-from-name'));
      });
    });
  }

  function renderMessage(m, meId){
    var time = settings.showTimestamps
      ? '<span class="cm-time">' + formatTime(m.ts) + '</span>'
      : '';
    var bodyMasked = filterMessage(m.body);
    var bodyHtml = highlightMentions(escapeHtml(bodyMasked), meId);
    var mineClass = (m.fromId === meId) ? ' mine' : '';
    var systemClass = m.system ? ' system' : '';
    var mentionsMe = (m.mentions || []).indexOf(meId) !== -1;
    var hilite = mentionsMe ? ' mentions-me' : '';
    if(m.system){
      return '<div class="chat-msg' + systemClass + hilite + '"><span class="cm-body">' + bodyHtml + '</span></div>';
    }
    return ''
      + '<div class="chat-msg' + mineClass + hilite + '">'
      +   time
      +   '<span class="cm-name" data-from-id="' + escapeAttr(m.fromId) + '" data-from-name="' + escapeAttr(m.fromName) + '">' + escapeHtml(m.fromName) + '</span>'
      +   '<span class="cm-body">' + bodyHtml + '</span>'
      + '</div>';
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }
  function escapeAttr(s){ return escapeHtml(s).replace(/\s/g,' '); }

  function filterMessage(body){
    if(window.ChatFilter && typeof window.ChatFilter.filter === 'function'){
      return window.ChatFilter.filter(body, { profanityFilter: settings.profanityFilter });
    }
    return body;
  }

  function highlightMentions(escapedBody, meId){
    return escapedBody.replace(/@([\w-]{2,24})/g, function(match, name){
      // We only know names locally; to highlight self-mentions we
      // compare against current player's name (case-insensitive).
      var meName = me().name.toLowerCase();
      var isMe = name.toLowerCase() === meName;
      return '<span class="cm-mention' + (isMe ? ' mentions-me' : '') + '">@' + escapeHtml(name) + '</span>';
    });
  }

  function formatTime(ts){
    var d = new Date(ts);
    var hh = String(d.getHours()).padStart(2,'0');
    var mm = String(d.getMinutes()).padStart(2,'0');
    return hh + ':' + mm;
  }

  // ── Name menu (whisper / block / cancel) ────────────────────
  function showNameMenu(anchor, playerId, playerName){
    closeNameMenu();
    var meId = me().id;
    if(playerId === meId) return;          // can't menu yourself
    var menu = document.createElement('div');
    menu.id = 'chat-name-menu';
    var rect = anchor.getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.top  = (rect.bottom + 4) + 'px';
    var isBlocked = blocked.indexOf(playerId) !== -1;
    menu.innerHTML = ''
      + '<div class="cnm-head">' + escapeHtml(playerName) + '</div>'
      + '<button data-act="whisper">💬 Whisper</button>'
      + (isBlocked
          ? '<button data-act="unblock">✓ Unblock</button>'
          : '<button data-act="block">🚫 Block</button>')
      + '<button data-act="cancel">Cancel</button>';
    document.body.appendChild(menu);
    menu.addEventListener('click', function(e){
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if(act === 'whisper') openWhisper(playerId, playerName);
      else if(act === 'block')   { blockPlayer(playerId);   renderActive(); }
      else if(act === 'unblock') { unblockPlayer(playerId); renderActive(); }
      closeNameMenu();
    });
    // Close on outside click
    setTimeout(function(){
      document.addEventListener('click', closeNameMenu, { once: true });
    }, 10);
  }
  function closeNameMenu(){
    var existing = document.getElementById('chat-name-menu');
    if(existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function openWhisper(playerId, playerName){
    state.whispers[playerId] = state.whispers[playerId] || { name: playerName, lastSeen: 0 };
    state.whispers[playerId].name = playerName;     // refresh the name
    saveState();
    renderTabs();
    switchChannel('whisper:' + playerId);
  }

  function blockPlayer(playerId){
    if(blocked.indexOf(playerId) === -1) blocked.push(playerId);
    saveBlocked();
    if(typeof window.notify === 'function') window.notify('Blocked. You won\'t see their messages.', 'info');
  }
  function unblockPlayer(playerId){
    var i = blocked.indexOf(playerId);
    if(i !== -1) blocked.splice(i, 1);
    saveBlocked();
  }

  // ── Sending ────────────────────────────────────────────────
  var lastSentAt = 0;
  function onSendClick(){ doSend(); }
  function onInputKey(e){
    // Submit autocomplete on Tab / Enter when popup is showing
    if(mentionPopEl.style.display !== 'none'){
      if(e.key === 'Tab' || e.key === 'Enter'){
        var first = mentionPopEl.querySelector('.cmp-item');
        if(first){ e.preventDefault(); applyMention(first.getAttribute('data-name')); return; }
      }
      if(e.key === 'Escape'){ mentionPopEl.style.display = 'none'; return; }
    }
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      doSend();
    }
  }
  function onInputChange(){
    // @mention autocomplete
    var v = inputEl.value;
    var m = v.slice(0, inputEl.selectionStart || v.length).match(/@([\w-]*)$/);
    if(m){ showMentionAutocomplete(m[1]); }
    else { mentionPopEl.style.display = 'none'; }
  }

  function showMentionAutocomplete(prefix){
    var roster = recentNames();
    var lower = prefix.toLowerCase();
    var matches = roster.filter(function(n){ return n.toLowerCase().indexOf(lower) === 0; }).slice(0, 6);
    if(!matches.length){ mentionPopEl.style.display = 'none'; return; }
    mentionPopEl.innerHTML = matches.map(function(n){
      return '<button class="cmp-item" data-name="' + escapeAttr(n) + '">@' + escapeHtml(n) + '</button>';
    }).join('');
    mentionPopEl.style.display = 'block';
    mentionPopEl.querySelectorAll('.cmp-item').forEach(function(b){
      b.addEventListener('click', function(){ applyMention(b.getAttribute('data-name')); });
    });
  }

  function applyMention(name){
    var v = inputEl.value;
    var caret = inputEl.selectionStart || v.length;
    var before = v.slice(0, caret).replace(/@[\w-]*$/, '@' + name + ' ');
    var after = v.slice(caret);
    inputEl.value = before + after;
    inputEl.selectionStart = inputEl.selectionEnd = before.length;
    mentionPopEl.style.display = 'none';
    inputEl.focus();
  }

  // Build a roster from recently-seen names across all loaded channels.
  function recentNames(){
    var seen = {};
    Object.keys(cache).forEach(function(ch){
      (cache[ch] || []).forEach(function(m){
        if(!m.fromName) return;
        seen[m.fromName] = true;
      });
    });
    // Always include self for self-mention testing
    var meName = me().name; if(meName) seen[meName] = true;
    return Object.keys(seen).sort();
  }

  function doSend(){
    var v = (inputEl.value || '').trim();
    if(!v) return;
    if(v.length > MAX_MSG_LEN){
      if(typeof window.notify === 'function') window.notify('Message too long (' + MAX_MSG_LEN + ' max)', 'kill');
      return;
    }
    var now = Date.now();
    if(now - lastSentAt < SEND_THROTTLE){
      // Silently drop — no spammy "rate limited" banner
      return;
    }
    lastSentAt = now;
    var channel = state.active;
    if(channel === 'clan' && !clanOf()){
      if(typeof window.notify === 'function') window.notify('Join a clan first.', 'kill');
      return;
    }
    var p = me();
    var mentions = extractMentions(v);
    var msg = {
      id: 'msg-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      channel: channel,
      fromId: p.id,
      fromName: p.name,
      body: v,
      ts: now,
      mentions: mentions,
    };
    inputEl.value = '';
    // backend.send() notifies the subscriber synchronously, which is the
    // path that adds the message to cache + re-renders. We don't double-
    // push here or the message would render twice.
    backend.send(channel, msg).then(function(){
      if(typeof window.trackEvent === 'function') window.trackEvent('chat_send', { channel: channel, len: v.length });
    });
  }

  function extractMentions(text){
    // For the local backend we only know names, not IDs. We store
    // names in mentions[] as a stand-in. The Supabase backend will
    // resolve names to IDs server-side.
    var m, out = [], re = /@([\w-]{2,24})/g;
    while((m = re.exec(text)) !== null){ out.push(m[1]); }
    return out;
  }

  // ── Mini-badge (unread total when collapsed) ───────────────
  function updateMiniBadge(){
    var total = 0;
    Object.keys(state.unread).forEach(function(k){ total += state.unread[k] || 0; });
    var b = document.getElementById('chat-mini-badge');
    if(!b) return;
    if(total > 0){
      b.textContent = total > 99 ? '99+' : String(total);
      b.style.display = '';
    } else {
      b.style.display = 'none';
    }
  }

  // ── Public API ─────────────────────────────────────────────
  /**
   * Public chat API. Open / close the dock, send programmatic
   * messages (used by system bots and level-up announcers), open
   * a whisper thread with another player, manage the local block
   * list, and (post Phase-2) hot-swap to the Supabase realtime
   * backend.
   *
   * @type {{
   *   toggle: () => void,
   *   open: () => void,
   *   close: () => void,
   *   send: (channel: string, body: string) => void,
   *   openWhisper: (playerId: string, playerName: string) => void,
   *   block: (playerId: string) => void,
   *   unblock: (playerId: string) => void,
   *   setBackend: (impl: ChatBackend) => void,
   *   getSettings: () => ChatSettings,
   *   setSetting: (key: string, value: any) => void,
   * }}
   */
  window.Chat = {
    toggle: toggleDock,
    open:   function(){ if(settings.minimized) toggleDock(); },
    close:  function(){ if(!settings.minimized) toggleDock(); },
    send:   function(channel, body){
      // Programmatic send (used by system bot / level-up notifier)
      var p = me();
      var msg = {
        id: 'sys-' + Date.now().toString(36),
        channel: channel,
        fromId: 'system',
        fromName: 'System',
        body: body,
        ts: Date.now(),
        mentions: [],
        system: true,
      };
      backend.send(channel, msg).then(function(){
        cache[channel] = cache[channel] || [];
        cache[channel].push(msg);
        if(state.active === channel) renderActive();
      });
    },
    openWhisper: openWhisper,
    block:       blockPlayer,
    unblock:     unblockPlayer,
    setBackend: function(impl){
      // Tear down old subscriptions before swapping. Without this the
      // new backend has empty _listeners, so neither send-echoes nor
      // realtime pushes from other users would render — symptom: you
      // type a message, network 201s, but the dock stays empty until
      // the next manual fetch.
      try { unsubFns.forEach(function(u){ try{ u && u(); }catch(e){} }); } catch(e){}
      unsubFns = [];
      backend = impl;
      cache = {};                // drop the local cache
      // Re-subscribe to the same default channels on the new backend.
      subscribeAllChannels();
      // Re-load the active channel from the new backend.
      loadCache(state.active).then(function(){ renderActive(); });
    },
    getSettings: function(){ return Object.assign({}, settings); },
    setSetting:  function(k, v){
      settings[k] = v; saveSettings();
      if(k === 'profanityFilter' || k === 'showTimestamps') renderActive();
    },
  };

  // Subscribe to every DEFAULT_CHANNELS id on the current `backend`.
  // Extracted so setBackend() can re-subscribe after a hot-swap.
  function subscribeAllChannels(){
    DEFAULT_CHANNELS.forEach(function(ch){
      var unsub = backend.subscribe(ch.id, function(newMsgs){
        cache[ch.id] = cache[ch.id] || [];
        // Idempotent merge by ID — guards against double-delivery
        // from any backend implementation or future race conditions.
        var existingIds = {};
        cache[ch.id].forEach(function(m){ existingIds[m.id] = true; });
        newMsgs.forEach(function(m){
          if(!existingIds[m.id]){ cache[ch.id].push(m); existingIds[m.id] = true; }
        });
        if(cache[ch.id].length > MSG_CAP) cache[ch.id].splice(0, cache[ch.id].length - MSG_CAP);
        if(state.active === ch.id){
          renderActive();
        } else if(settings.minimized){
          // Bump unread on this channel
          var meId = me().id;
          var newCount = newMsgs.filter(function(m){
            return m.fromId !== meId && blocked.indexOf(m.fromId) === -1;
          }).length;
          if(newCount){
            state.unread[ch.id] = (state.unread[ch.id] || 0) + newCount;
            saveState();
            renderTabs();
            updateMiniBadge();
            // Mention ping
            var mentioned = newMsgs.some(function(m){
              return (m.mentions || []).indexOf(meId) !== -1
                  || (m.body || '').toLowerCase().indexOf('@' + me().name.toLowerCase()) !== -1;
            });
            if(mentioned && settings.soundOnMention && typeof window.notify === 'function'){
              window.notify('💬 You were mentioned in #' + ch.id, 'info');
            }
          }
        }
      });
      unsubFns.push(unsub);
    });
  }

  // ── Boot ───────────────────────────────────────────────────
  function boot(){
    buildDock();
    // Preload the default channel so it shows instantly on first expand
    loadCache(state.active).then(function(){
      renderActive();
      updatePlaceholder();
    });
    subscribeAllChannels();
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(boot, 400); });
  } else {
    setTimeout(boot, 400);
  }

  console.log('[chat] loaded — ' + DEFAULT_CHANNELS.length + ' channels, profanity filter ' + (settings.profanityFilter ? 'ON' : 'OFF'));
})();
