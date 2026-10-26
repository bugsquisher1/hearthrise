// ════════════════════════════════════════════════════════════════════════
// src/social/realtime.js — THE SOCIAL REALTIME CONTRACT: WHICH LINES ARRIVE PUSHED.
//
// Private BROADCAST topics over the one supabase-js client (src/net/supabase-
// bootstrap.js). The server sends every stored line itself, once, to exactly
// the topics allowed to hear it (supabase/migrations/2026-12-26-chat-broadcast.sql
// hr_chat_broadcast / hr_whisper_broadcast), and realtime.messages RLS lets a
// player join only the public chat topics and its own inbox:
//   chat:global · chat:system · chat:local:<zone>   one join per public channel shown
//   chat:inbox:<uid>                                ONE join per account: the whispers
//                                                   TO it (event 'whisper') and the party
//                                                   lines of its party (event 'line')
// A message is { t, line } with `line` the server's row (hr_chat_row /
// hr_whisper_row), handed on as the server wrote it. Nothing is a postgres_changes
// subscription any more: the WAL poller those cost (38.6 % of database time,
// 2026-10-23) has nothing to decode (tests/realtime-cost.mjs).
// createSocialRealtime(client, token) answers { chat(uid, channels, onRow, onJoin),
// whispers(uid, onRow, onJoin), bindings() }, each subscription returning leave().
// onJoin() runs after EVERY (re)join of a topic the subscription listens on, so
// its store re-reads the history it may have missed while the socket was down:
// a blip loses nothing. ONE CLIENT HOLDS AT MOST CHAT_LIMITS.realtimeBindingsMax
// joins: a chat subscription past the ceiling keeps the first channels it was
// given (global, system, zone, party, in that order); the inbox is shared by the
// party and the whispers and counts once.
// ════════════════════════════════════════════════════════════════════════

import { CHAT_LIMITS } from '../data/chat-channels.js?v=0.2.49';

const PUBLIC = /^(global|system|local:[a-z0-9_]{1,64})$/;
const PARTY = /^party:[0-9a-f-]{36}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lineOf = (m) => (m && m.payload && m.payload.line) || null;

/**
 * @param {object} client          the supabase-js client
 * @param {() => string|null} token the signed-in access token
 */
export function createSocialRealtime(client, token) {
  const live = new Set();   // every topic channel this client holds (one join each)
  let inbox = null;         // { uid, ch, line: Set, whisper: Set, join: Set }
  const held = () => live.size;
  function auth() { try { client.realtime.setAuth(token()); } catch (e) { /* the join reports it */ } }
  function join(topic, events, onJoin) {
    auth();
    const ch = client.channel(topic, { config: { private: true } });
    for (const [event, fn] of Object.entries(events)) ch.on('broadcast', { event }, fn);
    live.add(ch);
    ch.subscribe((status) => { if (status === 'SUBSCRIBED') onJoin(); });
    return ch;
  }
  function leave(ch) { live.delete(ch); try { client.removeChannel(ch); } catch (e) { /* already gone */ } }
  function inboxFor(uid) {
    if (inbox && inbox.uid === uid) return inbox;
    if (inbox) { leave(inbox.ch); inbox = null; }
    if (held() >= CHAT_LIMITS.realtimeBindingsMax) return null;
    const box = { uid, ch: null, line: new Set(), whisper: new Set(), join: new Set() };
    const fan = (set) => (m) => { const row = lineOf(m); for (const fn of Array.from(set)) fn(row); };
    box.ch = join('chat:inbox:' + uid.toLowerCase(), { line: fan(box.line), whisper: fan(box.whisper) },
      () => { for (const fn of Array.from(box.join)) fn(); });
    inbox = box;
    return box;
  }
  /* One listener on the account's inbox; the inbox is left when its last listener goes. */
  function onInbox(uid, kind, onRow, onJoin) {
    const box = inboxFor(uid);
    if (!box) return () => {};
    box[kind].add(onRow);
    if (onJoin) box.join.add(onJoin);
    return () => {
      box[kind].delete(onRow);
      if (onJoin) box.join.delete(onJoin);
      if (inbox === box && !box.line.size && !box.whisper.size) { leave(box.ch); inbox = null; }
    };
  }
  return {
    /** Lines on these channels (each a server channel string), as they are written: a public channel on its own
        topic, the party channel through the account's inbox (the server sends it each member's copy). */
    chat(uid, channels, onRow, onJoin) {
      const joined = () => { if (onJoin) onJoin(); };
      const leaves = [];
      for (const c of (channels || []).filter((x) => typeof x === 'string' && (PUBLIC.test(x) || PARTY.test(x)))) {
        if (PARTY.test(c)) {
          if (typeof uid === 'string' && UUID.test(uid)) leaves.push(onInbox(uid, 'line', onRow, joined));
          continue;
        }
        if (held() >= CHAT_LIMITS.realtimeBindingsMax) break;
        const ch = join('chat:' + c, { line: (m) => onRow(lineOf(m)) }, joined);
        leaves.push(() => leave(ch));
      }
      return () => { for (const off of leaves.splice(0)) off(); };
    },
    /** Whispers TO this account, as they are written (the sender's own come back from hr_whisper_send). */
    whispers(uid, onRow, onJoin) {
      if (typeof uid !== 'string' || !UUID.test(uid)) return () => {};
      return onInbox(uid, 'whisper', onRow, onJoin);
    },
    /** How many topic joins this client holds now (a test probe and a cost readout). */
    bindings: held,
  };
}
