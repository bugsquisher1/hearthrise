// ════════════════════════════════════════════════════════════════════════
// src/social/realtime.js — THE SOCIAL REALTIME CONTRACT: WHICH ROWS ARRIVE PUSHED.
//
// Two subscriptions over the one supabase-js client (src/net/supabase-bootstrap.js),
// both INSERT-only postgres_changes, both filtered so a client hears only what
// it shows; Realtime evaluates the tables' RLS per subscriber, so a party line
// reaches only its audience and a blocked sender reaches nobody who blocked them
// (supabase/migrations/2026-10-25-chat-channels.sql, 2026-10-25-social.sql):
//   chat_messages   one binding per channel shown: channel=eq.<channel>
//   chat_whispers   to_id=eq.<this account>
// The publication carries exactly these two tables (tests/realtime-cost.mjs).
// createSocialRealtime(client, token) answers { chat(channels, onRow), whispers(uid, onRow),
// bindings() }, each subscription returning leave(). A row is handed on as the
// server wrote it. ONE CLIENT HOLDS AT MOST CHAT_LIMITS.realtimeBindingsMax
// bindings across both: a chat subscription past the ceiling keeps the first
// channels it was given (global, system, zone, party, in that order) and drops
// the rest — every binding is a filter the Realtime poller runs per write.
// ════════════════════════════════════════════════════════════════════════

import { CHAT_LIMITS } from '../data/chat-channels.js?v=0.2.10';

const CHANNEL = /^(global|system|local:[a-z0-9_]{1,64}|party:[0-9a-f-]{36})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {object} client          the supabase-js client
 * @param {() => string|null} token the signed-in access token
 */
export function createSocialRealtime(client, token) {
  let n = 0;
  const live = new Map();   // realtime channel -> bindings it holds
  const held = () => Array.from(live.values()).reduce((a, b) => a + b, 0);
  function auth() { try { client.realtime.setAuth(token()); } catch (e) { /* the join reports it */ } }
  function leaveOf(ch) { return () => { live.delete(ch); try { client.removeChannel(ch); } catch (e) { /* already gone */ } }; }
  return {
    /** Lines on these channels (each a server channel string), as they are written. */
    chat(channels, onRow) {
      const list = (channels || []).filter((c) => typeof c === 'string' && CHANNEL.test(c))
        .slice(0, Math.max(0, CHAT_LIMITS.realtimeBindingsMax - held()));
      if (!list.length) return () => {};
      auth();
      const ch = client.channel('hr-chat-' + (++n));
      for (const c of list) {
        ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'channel=eq.' + c },
          (m) => onRow(m && m.new));
      }
      live.set(ch, list.length);
      ch.subscribe(() => {});
      return leaveOf(ch);
    },
    /** Whispers TO this account, as they are written (the sender's own come back from hr_whisper_send). */
    whispers(uid, onRow) {
      if (typeof uid !== 'string' || !UUID.test(uid) || held() >= CHAT_LIMITS.realtimeBindingsMax) return () => {};
      auth();
      const ch = client.channel('hr-whispers-' + (++n));
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_whispers', filter: 'to_id=eq.' + uid },
        (m) => onRow(m && m.new));
      live.set(ch, 1);
      ch.subscribe(() => {});
      return leaveOf(ch);
    },
    /** How many bindings this client holds now (a test probe and a cost readout). */
    bindings: held,
  };
}
