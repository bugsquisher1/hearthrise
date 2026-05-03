// ============================================================
// src/net/supabase-chat-backend.js
//
// Realtime chat backend for Hearthrise. Implements the same shape
// as the LocalBackend in src/chat.js (send, fetch, subscribe) so
// chat.js can hot-swap to it via `window.Chat.setBackend(...)`.
//
// Loaded by supabase-bootstrap.js only when credentials are present.
// In offline mode, chat.js's LocalBackend keeps running unchanged.
//
// Wire format (chat_messages table):
//   id          uuid
//   channel     text  ('global' | 'trade' | 'clan:<id>' | 'whisper:<a>:<b>')
//   from_id     uuid
//   from_name   text
//   body        text  (1..240 chars, server-validated)
//   mentions    uuid[]
//   created_at  timestamptz
//
// Realtime: subscribed via Supabase channels — the client gets
// INSERTs for any channel it has read access to under RLS.
// ============================================================

import { getSession } from './auth.js';

const REST_HEADERS = (cfg, session) => ({
  'apikey': cfg.anonKey,
  'Authorization': 'Bearer ' + (session?.access_token || cfg.anonKey),
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
});

function getCfg() {
  return (window.HearthriseSupabase && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig()) || null;
}

/**
 * Convert a Supabase chat_messages row into the shape chat.js expects.
 */
function rowToMsg(row) {
  return {
    id: row.id,
    channel: row.channel,
    fromId: row.from_id,
    fromName: row.from_name,
    body: row.body,
    ts: new Date(row.created_at).getTime(),
    mentions: row.mentions || [],
  };
}

class SupabaseChatBackend {
  constructor() {
    this._listeners = {};        // channel -> [callback]
    this._supabase = null;        // populated on first call
    this._channels = new Map();   // channel -> Realtime subscription
  }

  async _client() {
    if (this._supabase) return this._supabase;
    const cfg = getCfg();
    if (!cfg) throw new Error('Supabase not configured');
    const mod = await import('https://cdn.skypack.dev/@supabase/supabase-js');
    this._supabase = mod.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false },     // auth.js owns session storage
    });
    const session = getSession();
    if (session?.access_token) {
      this._supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    }
    return this._supabase;
  }

  async send(channel, msg) {
    const cfg = getCfg();
    if (!cfg) throw new Error('Supabase not configured');
    const session = getSession();
    if (!session?.access_token) throw new Error('Not signed in');
    const body = {
      channel,
      from_id:   msg.fromId,
      from_name: msg.fromName,
      body:      msg.body,
      mentions:  msg.mentions || [],
    };
    const res = await fetch(cfg.url + '/rest/v1/chat_messages', {
      method: 'POST',
      headers: REST_HEADERS(cfg, session),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('chat send failed: ' + res.status + ' ' + txt);
    }
    const rows = await res.json();
    const saved = rows[0] ? rowToMsg(rows[0]) : msg;
    // Local listeners get the saved row immediately (with the server-issued
    // id + ts). Realtime will also push the same row to peers.
    const subs = this._listeners[channel] || [];
    subs.forEach(cb => { try { cb([saved]); } catch (e) {} });
    return saved;
  }

  async fetch(channel, sinceTs) {
    const cfg = getCfg();
    if (!cfg) return [];
    const session = getSession();
    let url = cfg.url + '/rest/v1/chat_messages?channel=eq.' + encodeURIComponent(channel)
              + '&order=created_at.asc&limit=200';
    if (sinceTs) {
      url += '&created_at=gt.' + encodeURIComponent(new Date(sinceTs).toISOString());
    }
    const res = await fetch(url, {
      headers: {
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + (session?.access_token || cfg.anonKey),
      },
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map(rowToMsg);
  }

  subscribe(channel, callback) {
    if (!this._listeners[channel]) this._listeners[channel] = [];
    this._listeners[channel].push(callback);

    // Also register a Realtime subscription so peer messages flow in.
    if (!this._channels.has(channel)) {
      this._client().then(client => {
        const sub = client
          .channel('chat-' + channel)
          .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'channel=eq.' + channel },
            (payload) => {
              const msg = rowToMsg(payload.new);
              const subs = this._listeners[channel] || [];
              subs.forEach(cb => { try { cb([msg]); } catch (e) {} });
            })
          .subscribe();
        this._channels.set(channel, sub);
      });
    }

    return () => {
      const arr = this._listeners[channel] || [];
      const i = arr.indexOf(callback);
      if (i !== -1) arr.splice(i, 1);
      // Drop the realtime subscription when the last listener leaves.
      if (arr.length === 0) {
        const sub = this._channels.get(channel);
        if (sub) {
          this._client().then(c => c.removeChannel(sub));
          this._channels.delete(channel);
        }
      }
    };
  }
}

// Hot-swap chat.js's backend the moment we load.
if (window.Chat && typeof window.Chat.setBackend === 'function') {
  const backend = new SupabaseChatBackend();
  window.Chat.setBackend(backend);
  console.log('[supabase-chat] live backend installed');
} else {
  console.warn('[supabase-chat] window.Chat not available — backend swap skipped');
}
