#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/session-core.mjs — THE CLIENT'S SESSION RULES, ONE TEST PER RULE.
//
//   node tests/session-core.mjs           the rules (pure node, no network)
//   node tests/session-core.mjs --mutate  every planted defect must turn a rule RED
//
// mutant-anchors: src/session/ src/net/auth.js src/net/supabase-bootstrap.js
// mutant-writes-tree: no — mutants are planted into a temp copy of src/session + src/net/auth.js + src/net/supabase-bootstrap.js + src/hunt-view + src/data + src/core
//
//   ENV-1  a full envelope REPLACES the record: a key the new one lacks is gone
//   ENV-2  an older envelope is refused; the same version restates
//   ENV-3  a frame replaces each key it states WHOLE and leaves the rest
//   ENV-4  frames: not before the first load, never duplicate/reorder, no partial bag
//   ENV-5  malformed / not ok / no `state` answers change nothing
//   ENV-6  the record is frozen and never aliases the server's object
//   RES-1  the residue is an allowlist: unknown client_state fields never arrive
//   ISO-1  two characters never share a record, a topic, a listener or a residue write
//   ISO-2  a frame for one character changes only that one
//   CHAN-1 every join of a character's topic re-reads the character once (hello); a dropped
//          channel is left and re-joined after a backoff
//   CHAN-3 a leave from inside the channel's own status callback (removeChannel echoes CLOSED)
//          leaves once and schedules one reconnect, never recursing (live v0.2.6)
//   CHAN-2 a frame that skips versions asks for one hello (the gap is closed, not guessed)
//   HELLO-1 an idle settle answer ({accrued:false}) is never applied as the character: the full read follows
//   HUNT-1 while the server holds a hunt open the character asks the hunter's settle every huntPollMs
//          (attended): the track reaches the timeline; the envelope that says it ended stops the asking
//   HUNT-2 a pending leave is settled at once (away-owed time) and its envelope replaces the open hunt
//   LEAVE-1 a pending leave's close is re-read a hair after the SERVER's leave_at (server clock), moving
//          an armed poll earlier; the closing envelope ends the hunt and the re-reads stop
//   LEAVE-2 a refused settle after a pending leave is followed by the plain read (leave_at is shown)
//   LEAVE-3 the countdown starts from the leave's own answer (the settle after it still out): whole
//          seconds >= 1 to leave_at, then "now" (never 0 or negative), then "late" a leaveLateMs past
//          it, and the close is still asked while it is late; the next hunt shows none
//   ACC-1  at most the server's concurrent limit open (within the tab's ceiling); close frees a place
//   ACC-4  the limit is the SERVER's (account.max_concurrent): a smaller one holds, an unstated one
//          allows one character, a larger one is capped by the tab's ceiling
//   VIEW-2 switching the viewed character touches no CharacterSession: records, statuses, topics,
//          listeners and the server calls of every character are exactly as before
//   ACC-2  the roster is the server's owned slots (hero_slots), bounded; a slot whose
//          character has no name (hr_load needs_name) reads as unnamed, not as a hero;
//          create is ONE hr_create_hero with the name, the four colours and an idem key
//   ACC-5  a hero slot is bought at the SERVER's offer (account.hero_slot_offer; none at the cap or
//          unstated): ONE hr_buy_hero_slot with the slot, the paying hero and a fresh idem key, no
//          price; a refusal comes back by name (short_by kept); a yes re-reads the open paying hero
//   ACC-3  the closed-game answer (403 hr_closed) is noticed, never retried as play
//   NET-1  the engine is asked in the database's region (forceFunctionRegion from SUPABASE_CONFIG)
//   OUT-1  sign-out clears every copy of the session (device + tab, sb-*, retired keys, tab id) and closes every character
//   TAB-1  the tab id is stable within a tab and new for a new tab
//   COPY-1 sign-up/reset copy never reveals whether an email has an account; no "open beta"/"invite code"
//   TOK-1  a token about to expire is refreshed BEFORE the call; the call carries the new one
//          (live 2026-10-20: a background tab sent a token dead for 14 h, 805 times)
//   TOK-2  a 401 renews the token once and retries that call once, never more
//   TOK-3  a refresh the server refuses ends the session: 'expired' once, and no further call is sent
//   TOK-4  two characters in one tab share ONE refresh
//   TOK-5  waking a hidden tab checks the token before the next call
//   VIEW-1 the world view reads only the character's record and its own scratch
// ════════════════════════════════════════════════════════════════════════
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function load(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  return {
    E: await import(u('src/session/envelope.js')),
    R: await import(u('src/session/residue.js')),
    C: await import(u('src/session/character-session.js')),
    A: await import(u('src/session/account-session.js')),
    S: await import(u('src/session/server.js')),
    AU: await import(u('src/net/auth.js')),
    NB: await import(u('src/net/supabase-bootstrap.js')),
    CFG: await import(u('src/session/config.js')),
  };
}

const UID = '11111111-2222-3333-4444-555555555555';
const env = (version, extra) => Object.assign({ ok: true, version, state: { gold: 1 } }, extra || {});

function memStore() {
  const m = new Map();
  return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { m.set(k, String(v)); return true; }, remove: (k) => { m.delete(k); },
    keys: () => Array.from(m.keys()), _m: m };
}

/** A fake server: per-slot envelopes, a call log, optional closed answers. */
function fakeServer(bySlot, o = {}) {
  const calls = [];
  const answer = (body) => ({ ok: true, status: 200, body, closed: false });
  return {
    calls,
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (o.closed) return { ok: false, status: 403, body: { code: 'hr_closed' }, closed: true };
      if (name === 'hr_load') return answer(bySlot[args.p_slot] || { ok: false, error: 'no_character' });
      if (name === 'hr_put_client_state') return answer({ ok: true });
      if (name === 'hr_create_hero') return answer(args.p_name === 'Taken' ? { ok: false, error: 'name_taken' } : { ok: true, slot: args.p_slot, name: args.p_name, created: true });
      if (name === 'hr_buy_hero_slot') return answer(args.p_slot === 1 ? { ok: false, error: 'insufficient_gold', short_by: 400 }
        : { ok: true, slot_id: args.p_slot_id, gold: 5, hero_slots: [0, 1, 2], hero_slot_offer: { slot_id: 3, cost_gold: 250000 }, hero_slots_max: 5 });
      return answer({ ok: false, error: 'unknown' });
    },
    accrue: async (body) => { calls.push(['accrue', body]); return answer(Object.assign({ accrued: true }, bySlot[body.slot])); },
  };
}

/** A fake channel hub: topic -> handlers; send(topic, payload) delivers a frame. */
function fakeHub() {
  const topics = new Map();
  return {
    topics,
    channel: (topic, onMessage, onStatus) => { topics.set(topic, { onMessage, onStatus }); return () => topics.delete(topic); },
    send: (topic, payload) => { const t = topics.get(topic); if (t) t.onMessage(payload); },
  };
}
const timers = { setTimer: () => 0, clearTimer: () => {} };

async function rules(M) {
  const fails = [];
  const t = async (id, fn) => { try { const r = await fn(); if (r !== true) fails.push(id + ': ' + r); } catch (e) { fails.push(id + ': threw ' + e.message); } };
  const { E, R, C, A, S, AU, NB, CFG } = M;

  await t('ENV-1', () => {
    const a = E.applyEnvelope(null, env(3, { skills: { mining: 5 }, buffs: [1] })).record;
    const b = E.applyEnvelope(a, env(4, { skills: { attack: 2 } })).record;
    if ('buffs' in b.data) return 'a key the new envelope lacks survived (merged, not replaced)';
    if ('mining' in b.data.skills) return 'skills merged instead of replaced';
    return b.version === 4 || 'version did not move';
  });
  await t('ENV-2', () => {
    const a = E.applyEnvelope(null, env(5)).record;
    const old = E.applyEnvelope(a, env(4, { state: { gold: 99 } }));
    if (old.applied || old.verdict !== 'stale' || old.record !== a) return 'an older envelope was applied';
    const same = E.applyEnvelope(a, env(5, { state: { gold: 7 } }));
    return (same.applied && same.record.data.state.gold === 7) || 'the same version did not restate';
  });
  await t('ENV-3', () => {
    const a = E.applyEnvelope(null, env(1, { skills: { mining: 5, attack: 3 }, equipment: { head: 'x' } })).record;
    const f = E.applyFrame(a, { t: 'delta', frame: 2, patch: { skills: { attack: 4 } } });
    if (!f.applied) return 'a fresh frame was refused: ' + f.verdict;
    if ('mining' in f.record.data.skills) return 'a frame merged inside a key';
    if (!f.record.data.equipment || f.record.data.equipment.head !== 'x') return 'a key the frame did not state was lost';
    return f.record.version === 2 || 'frame version not taken';
  });
  await t('ENV-4', () => {
    if (E.applyFrame(null, { t: 'delta', frame: 1, patch: { state: {} } }).verdict !== 'not_loaded') return 'a frame applied before the first load';
    const a = E.applyEnvelope(null, env(5)).record;
    if (E.applyFrame(a, { t: 'delta', frame: 5, patch: { state: {} } }).verdict !== 'duplicate') return 'duplicate applied';
    if (E.applyFrame(a, { t: 'delta', frame: 4, patch: { state: {} } }).verdict !== 'reorder') return 'reorder applied';
    if (E.applyFrame(a, { t: 'delta', frame: 6, patch: { inventory: { ore: 1 } } }).verdict !== 'bag_incomplete') return 'a partial bag applied';
    return E.applyFrame(a, { t: 'delta', frame: 6, patch: { inventory: { ore: 1 }, inventory_complete: true } }).applied || 'a complete bag was refused';
  });
  await t('ENV-5', () => {
    const a = E.applyEnvelope(null, env(2)).record;
    for (const bad of [null, [], { ok: false, error: 'rate_limited', version: 9 }, { ok: true, version: 'x', state: {} }, { ok: true, version: 9 },
      { ok: true, version: 9, state: [] }]) {
      const r = E.applyEnvelope(a, bad);
      if (r.applied || r.record !== a) return 'applied a bad answer: ' + JSON.stringify(bad);
    }
    for (const bad of [{ t: 'delta', frame: 3, patch: { gold: 1 } }, { t: 'x', frame: 3, patch: { state: {} } }, { t: 'delta', frame: -1, patch: { state: {} } }]) {
      if (E.applyFrame(a, bad).applied) return 'applied a bad frame: ' + JSON.stringify(bad);
    }
    return true;
  });
  await t('ENV-6', () => {
    const src = env(1, { skills: { mining: 5 } });
    const a = E.applyEnvelope(null, src).record;
    src.skills.mining = 99;
    if (a.data.skills.mining !== 5) return 'the record aliases the server object';
    try { a.data.skills.mining = 1; } catch (e) { /* strict-mode throw is fine */ }
    return (a.data.skills.mining === 5 && Object.isFrozen(a) && Object.isFrozen(a.data.skills)) || 'the record is writable';
  });
  await t('RES-1', () => {
    const a = E.applyEnvelope(null, env(1, { client_state: { hudLayout: { desktop: { vitals: { visible: false } } }, gold: 1e9, playerName: 'x' } })).record;
    if (Object.keys(a.residue).join() !== 'hudLayout') return 'non-allowlisted residue arrived: ' + Object.keys(a.residue);
    if ('client_state' in a.data) return 'client_state leaked into the record data';
    return (R.residueOf({ hudLayout: { desktop: { v: { opacity: 9 } } } }).hudLayout.desktop.v.opacity === 1) || 'residue not sanitized';
  });

  await t('ISO-1', async () => {
    const srv = fakeServer({ 0: env(1, { state: { gold: 10 } }), 1: env(1, { state: { gold: 20 } }) });
    const hub = fakeHub();
    const a = new C.CharacterSession({ slot: 0, uid: UID, server: srv, channel: hub.channel, ...timers });
    const b = new C.CharacterSession({ slot: 1, uid: UID, server: srv, channel: hub.channel, ...timers });
    await a.load(); await b.load(); a.connect(); b.connect();
    if (hub.topics.size !== 2) return 'two characters share one topic';
    let heardA = 0, heardB = 0;
    a.subscribe(() => heardA++); b.subscribe(() => heardB++);
    a.setResidue('hudLayout', { desktop: { vitals: { visible: false } } });
    if (b.record.residue.hudLayout) return 'a residue write reached the other character';
    if (heardB !== 0 || heardA !== 1) return 'listeners are shared';
    if (a.record === b.record || a.read('state').gold !== 10 || b.read('state').gold !== 20) return 'records are shared';
    await a.flushResidue();
    const puts = srv.calls.filter((c) => c[0] === 'hr_put_client_state');
    return (puts.length === 1 && puts[0][1].p_slot === 0) || 'the residue put named the wrong slot';
  });
  await t('ISO-2', async () => {
    const srv = fakeServer({ 0: env(1), 1: env(1) });
    const hub = fakeHub();
    const a = new C.CharacterSession({ slot: 0, uid: UID, server: srv, channel: hub.channel, ...timers });
    const b = new C.CharacterSession({ slot: 1, uid: UID, server: srv, channel: hub.channel, ...timers });
    await a.load(); await b.load(); a.connect(); b.connect();
    hub.send(C.frameTopic(UID, 0), { t: 'delta', frame: 2, patch: { state: { gold: 50 } } });
    return (a.read('state').gold === 50 && b.read('state').gold === 1 && b.record.version === 1) || 'a frame for one character moved the other';
  });

  await t('CHAN-1', async () => {
    const srv = fakeServer({ 0: env(1) });
    const hub = fakeHub();
    const pending = [];
    const cs = new C.CharacterSession({ slot: 0, uid: UID, server: srv, channel: hub.channel,
      setTimer: (fn) => { pending.push(fn); return pending.length; }, clearTimer: () => {} });
    await cs.load(); cs.connect();
    const topic = C.frameTopic(UID, 0);
    hub.topics.get(topic).onStatus('SUBSCRIBED');
    await new Promise((r) => setImmediate(r));
    const hellos = srv.calls.filter((c) => c[0] === 'accrue');
    if (hellos.length !== 1 || hellos[0][1].slot !== 0) return 'a join did not send exactly one hello for the slot';
    hub.topics.get(topic).onStatus('CHANNEL_ERROR');
    if (hub.topics.has(topic)) return 'a dropped channel was not left';
    if (pending.length !== 1) return 'no reconnect was scheduled after the drop';
    pending[0]();
    return hub.topics.has(topic) || 'the reconnect did not re-join the topic';
  });
  /* CHAN-3 (live v0.2.6, RangeError in _onChannel): supabase's removeChannel reports CLOSED to the
     channel's own status callback, synchronously; leaving from inside that callback must not recurse. */
  await t('CHAN-3', async () => {
    const srv = fakeServer({ 0: env(1) });
    let status = null, leaves = 0;
    const echoing = (topic, onMessage, onStatus) => { status = onStatus; return () => { leaves++; if (leaves > 50) throw new RangeError('Maximum call stack size exceeded'); onStatus('CLOSED'); }; };
    const pending = [];
    const cs = new C.CharacterSession({ slot: 0, uid: UID, server: srv, channel: echoing,
      setTimer: (fn) => { pending.push(fn); return pending.length; }, clearTimer: () => {} });
    await cs.load(); cs.connect();
    try { status('CHANNEL_ERROR'); } catch (e) { return 'a channel error recursed: ' + e.message; }
    if (leaves !== 1) return 'the channel was left ' + leaves + ' times for one error';
    if (pending.length !== 1) return 'one drop scheduled ' + pending.length + ' reconnects';
    cs.close();
    return leaves === 1 || 'close left an already-left channel again';
  });
  await t('CHAN-2', async () => {
    const srv = fakeServer({ 0: env(1) });
    const hub = fakeHub();
    const cs = new C.CharacterSession({ slot: 0, uid: UID, server: srv, channel: hub.channel, ...timers });
    await cs.load(); cs.connect();
    hub.send(C.frameTopic(UID, 0), { t: 'delta', frame: 2, patch: { state: { gold: 2 } } });
    if (srv.calls.some((c) => c[0] === 'accrue')) return 'a next-version frame asked for a hello';
    hub.send(C.frameTopic(UID, 0), { t: 'delta', frame: 5, patch: { state: { gold: 5 } } });
    await new Promise((r) => setImmediate(r));
    return srv.calls.filter((c) => c[0] === 'accrue').length === 1 || 'a version gap did not ask for one hello';
  });
  await t('HELLO-1', async () => {
    const calls = [];
    const srv = {
      rpc: async (name, args) => { calls.push(name); return { ok: true, status: 200, body: env(3, { skills: { mining: 9 } }), closed: false }; },
      accrue: async () => { calls.push('accrue'); return { ok: true, status: 200, body: { ok: true, accrued: false, reason: 'idle', version: 4 }, closed: false }; },
    };
    const cs = new C.CharacterSession({ slot: 0, uid: UID, server: srv, ...timers });
    await cs.hello();
    if (!cs.record || cs.record.version !== 3 || !cs.record.data.skills) return 'an idle settle answer was applied as the character';
    return calls.join(',') === 'accrue,hr_load' || 'the full read did not follow an idle settle: ' + calls.join(',');
  });

  /* HUNT-1 (ATTENDED, live v0.2.1 "Mill Cellar shows no monsters"): frames never carry `hunt` and the world
     tick flushes a session only every 90 s, so while a hunt is open the character itself asks the hunter's
     settle (one hello per huntPollMs); the answer's track reaches the timeline, and an ended hunt stops it. */
  await t('HUNT-1', async () => {
    const open = (v, extra) => env(v, Object.assign({ hunt: { session_id: 'h1', hunt_id: 'mill_cellar', ended: false } }, extra || {}));
    let next = open(2, { hunt_track: [{ u: 1, x: 3, y: 4, atMs: 1000 }], hunt_events: [], hunt_server_now_ms: 1000 });
    const calls = [];
    const srv = {
      rpc: async (name) => { calls.push(name); return { ok: true, status: 200, body: open(1), closed: false }; },
      accrue: async (b) => { calls.push('accrue:' + b.slot); return { ok: true, status: 200, body: Object.assign({ accrued: true }, next), closed: false }; },
    };
    const armed = [];
    const cs = new C.CharacterSession({ slot: 0, uid: UID, server: srv, setTimer: (fn, ms) => { armed.push({ fn, ms }); return armed.length; }, clearTimer: () => {} });
    await cs.load();
    /* The live view (option B) asks at once for its start point (liveAskMs); each answer without one
       doubles the wait, up to the ordinary huntPollMs settle (live-link.js askDelayMs). */
    if (armed.length !== 1 || armed[0].ms !== CFG.SESSION_CONFIG.liveAskMs) return 'an open hunt did not ask at once for its live start point: ' + JSON.stringify(armed.map((a) => a.ms));
    armed.shift().fn();
    await new Promise((r) => setImmediate(r));
    if (calls.join(',') !== 'hr_load,accrue:0') return 'the re-read did not ask the hunter\'s settle for the slot: ' + calls.join(',');
    if (!cs.timeline.units().includes(1)) return 'the settle\'s track never reached the timeline';
    if (armed.length !== 1) return 'the re-read did not re-arm while the hunt is open (' + armed.length + ')';
    const waits = [];
    for (let i = 0; i < 12 && armed.length === 1 && armed[0].ms < CFG.SESSION_CONFIG.huntPollMs; i++) { waits.push(armed[0].ms); armed.shift().fn(); await new Promise((r) => setImmediate(r)); }
    if (waits.some((w, i) => i > 0 && w !== Math.min(CFG.SESSION_CONFIG.huntPollMs, waits[i - 1] * 2))) return 'the asks for a live start point did not double: ' + waits.join(',');
    /* it never gives up while the hunt is open: it backs off all the way to the ordinary poll (v0.2.20 stopped after two) */
    if (!(waits[waits.length - 1] * 2 >= CFG.SESSION_CONFIG.huntPollMs)) return 'the asks for a live start point gave up before backing off to huntPollMs: ' + waits.join(',');
    if (armed.length !== 1 || armed[0].ms !== CFG.SESSION_CONFIG.huntPollMs) return 'without a live start point the ordinary re-read did not resume at huntPollMs: ' + JSON.stringify(armed.map((a) => a.ms));
    next = env(3, { hunt: { session_id: 'h1', hunt_id: 'mill_cellar', ended: true } });
    armed.shift().fn();
    await new Promise((r) => setImmediate(r));
    if (!cs.record.data.hunt.ended) return 'the ended hunt did not replace the open one';
    return armed.length === 0 || 'an ended hunt kept re-reading';
  });
  /* HUNT-1F (live v0.2.20, the http origin's blocked calls): an ask for the live start point that brings
     NO answer backs off like one that brings no start point; it never re-arms every liveAskMs forever. */
  await t('HUNT-1F', async () => {
    const open = (v) => env(v, { hunt: { session_id: 'h1', hunt_id: 'mill_cellar', ended: false } });
    const srv = {
      rpc: async () => ({ ok: true, status: 200, body: open(1), closed: false }),
      accrue: async () => ({ ok: false, status: 0, body: null, closed: false, error: 'network' }),
    };
    const armed = [];
    const cs = new C.CharacterSession({ slot: 0, uid: UID, server: srv, setTimer: (fn, ms) => { armed.push({ fn, ms }); return armed.length; }, clearTimer: () => {} });
    await cs.load();
    const waits = [];
    for (let i = 0; i < 8 && armed.length; i++) { waits.push(armed[0].ms); armed.shift().fn(); await new Promise((r) => setImmediate(r)); }
    const live = CFG.SESSION_CONFIG.liveAskMs;
    return (waits.length === 8 && waits[0] === live && waits[3] >= live * 8 && waits[7] === CFG.SESSION_CONFIG.huntPollMs)
      || 'failed asks did not back off to the ordinary poll: ' + waits.join(',');
  });
  /* HUNT-2 (AWAY / pending leave, live v0.2.1 "Leave hunt does nothing"): a leave with hunting time owed
     answers `pending`; the hunter's settle that follows ends it, and that envelope REPLACES the open hunt. */
  await t('HUNT-2', async () => {
    const calls = [];
    const srv = {
      rpc: async (name) => {
        calls.push(name);
        if (name === 'hr_hunt_leave') return { ok: true, status: 200, body: { ok: true, pending: true }, closed: false };
        return { ok: true, status: 200, body: env(1, { hunt: { session_id: 'h1', hunt_id: 'mill_cellar', ended: false } }), closed: false };
      },
      accrue: async () => { calls.push('accrue'); return { ok: true, status: 200, body: Object.assign({ accrued: true }, env(2, { hunt: { session_id: 'h1', hunt_id: 'mill_cellar', ended: true }, state: { gold: 1, active_kind: 'idle' } })), closed: false }; },
    };
    const cs = new C.CharacterSession({ slot: 0, uid: UID, server: srv, ...timers });
    await cs.load();
    const r = await cs.leaveHunt();
    if (!r.ok) return 'the pending leave answered ' + JSON.stringify(r);
    if (calls.join(',') !== 'hr_load,hr_hunt_leave,accrue') return 'a pending leave was not settled at once: ' + calls.join(',');
    return (cs.record.data.hunt.ended === true && cs.record.data.state.active_kind === 'idle') || 'the client still holds the hunt open after the leave';
  });

  /* LEAVE-1 (live v0.2.20 "Leave hunt is very buggy and delayed"): a leave pends until the server's
     leave_at (2026-10-31-live-horizon.sql). The re-read that closes it is timed by THAT instant on the
     SERVER's clock (a hair after it), moving an armed huntPollMs re-read earlier: never a whole poll
     after the close, and never read off the device clock (the server here runs years ahead of it). */
  await t('LEAVE-1', async () => {
    const S0 = Date.parse('2031-01-01T00:00:00Z');
    let clientT = 0, stage = 'open';
    const iso = (ms) => new Date(ms).toISOString();
    const hunt = (leaveAt, ended) => ({ session_id: 'h1', hunt_id: 'mill_cellar', ended: !!ended,
      session: { id: 'h1', leave_at: leaveAt === null ? null : iso(leaveAt), phase: leaveAt === null ? 'hunting' : 'leaving' } });
    let v = 1;
    const body = () => stage === 'ended'
      ? env(++v, { now: iso(S0 + clientT), hunt: hunt(null, true), state: { gold: 1, active_kind: 'idle' } })
      : env(++v, { now: iso(S0 + clientT), hunt: hunt(stage === 'leaving' ? S0 + 7000 : null) });
    const calls = [];
    const srv = {
      rpc: async (name) => {
        calls.push(name);
        if (name === 'hr_hunt_leave') { stage = 'leaving'; return { ok: true, status: 200, body: { ok: true, pending: true }, closed: false }; }
        return { ok: true, status: 200, body: body(), closed: false };
      },
      accrue: async () => { calls.push('accrue'); return { ok: true, status: 200, body: Object.assign({ accrued: true }, body()), closed: false }; },
    };
    const armed = [];
    const cs = new C.CharacterSession({ slot: 0, uid: UID, server: srv, now: () => clientT,
      setTimer: (fn, ms) => { armed.push({ fn, ms, live: true }); return armed.length; },
      clearTimer: (id) => { if (armed[id - 1]) armed[id - 1].live = false; } });
    const fire = async () => { const a = armed.filter((x) => x.live); if (a.length !== 1) return false; a[0].live = false; a[0].fn(); await new Promise((r) => setImmediate(r)); return true; };
    await cs.load();
    /* the live view's start-point asks back off first (live-link.js askDelayMs), up to the ordinary poll */
    for (let i = 0; i < 12; i++) {
      const a = armed.filter((x) => x.live);
      if (a.length === 1 && a[0].ms === CFG.SESSION_CONFIG.huntPollMs) break;
      if (!(await fire())) return 'the live ask did not arm once';
    }
    let live = armed.filter((x) => x.live);
    if (live.length !== 1 || live[0].ms !== CFG.SESSION_CONFIG.huntPollMs) return 'no ordinary re-read before the leave: ' + JSON.stringify(live.map((x) => x.ms));
    clientT = 1000;
    if (!(await cs.leaveHunt()).ok) return 'the pending leave was refused';
    if (Math.round(cs.serverNow()) !== S0 + 1000) return 'the server clock is not the server’s: ' + cs.serverNow();
    live = armed.filter((x) => x.live);
    const want = 6000 + CFG.SESSION_CONFIG.leaveSlackMs;
    if (live.length !== 1 || live[0].ms !== want) return 'the close is not asked a hair after the server’s leave_at (want ' + want + ' ms): ' + JSON.stringify(live.map((x) => x.ms));
    clientT = 1000 + want;
    stage = 'ended';
    if (!(await fire())) return 'the closing re-read did not run';
    if (cs.record.data.hunt.ended !== true) return 'the close at leave_at did not end the hunt on screen';
    return armed.filter((x) => x.live).length === 0 || 'an ended hunt kept re-reading';
  });

  /* LEAVE-2: the settle after a pending leave can be refused (the accrue bucket, a dropped request);
     the plain read still brings the server's leave_at, so the button counts down instead of offering
     Leave hunt again until the next poll. */
  await t('LEAVE-2', async () => {
    const calls = [];
    let leaving = false;
    const hunt = () => ({ session_id: 'h1', hunt_id: 'mill_cellar', ended: false,
      session: { id: 'h1', leave_at: leaving ? '2031-01-01T00:00:07.000Z' : null } });
    let v = 1;
    const srv = {
      rpc: async (name) => {
        calls.push(name);
        if (name === 'hr_hunt_leave') { leaving = true; return { ok: true, status: 200, body: { ok: true, pending: true }, closed: false }; }
        return { ok: true, status: 200, body: env(++v, { now: '2031-01-01T00:00:01.000Z', hunt: hunt() }), closed: false };
      },
      accrue: async () => { calls.push('accrue'); return { ok: false, status: 429, body: { ok: false, error: 'rate_limited' }, closed: false }; },
    };
    const cs = new C.CharacterSession({ slot: 0, uid: UID, server: srv, ...timers });
    await cs.load();
    if (!(await cs.leaveHunt()).ok) return 'the pending leave was refused';
    if (calls.join(',') !== 'hr_load,hr_hunt_leave,accrue,hr_load') return 'a refused settle was not followed by the plain read: ' + calls.join(',');
    return cs.record.data.hunt.session.leave_at === '2031-01-01T00:00:07.000Z' || 'the record does not carry the server’s leave_at';
  });

  /* LEAVE-3 (Tyler 10-20: "a countdown so they know it's not just stuck"): the number shows one round
     trip after the press, from hr_hunt_leave's own answer (the session it set leave_at on), while the
     settle that follows is still out; it never reads 0 or below; past leave_at it is "now", and a
     leaveLateMs past it "late", with the close still being asked. */
  await t('LEAVE-3', async () => {
    const S0 = Date.parse('2031-01-01T00:00:00Z');
    const iso = (ms) => new Date(ms).toISOString();
    let clientT = 0, v = 1, release = null, sid = 'h1';
    const hunt = (leaveAt) => ({ session_id: sid, hunt_id: 'mill_cellar', ended: false,
      session: { id: sid, leave_at: leaveAt === null ? null : iso(leaveAt), phase: leaveAt === null ? 'hunting' : 'leaving' } });
    const LEAVE_AT = S0 + 7000;
    let leaving = false;
    const body = () => env(++v, { now: iso(S0 + clientT), hunt: hunt(leaving ? LEAVE_AT : null) });
    const srv = {
      rpc: async (name) => {
        if (name === 'hr_hunt_leave') { leaving = true; return { ok: true, status: 200, body: { ok: true, pending: true, session: hunt(LEAVE_AT).session }, closed: false }; }
        return { ok: true, status: 200, body: body(), closed: false };
      },
      /* the settle after the leave hangs until released (a slow edge answer) */
      accrue: () => new Promise((ok) => { release = () => ok({ ok: true, status: 200, body: Object.assign({ accrued: true }, body()), closed: false }); }),
    };
    const armed = [];
    const cs = new C.CharacterSession({ slot: 0, uid: UID, server: srv, now: () => clientT,
      setTimer: (fn, ms) => { armed.push({ fn, ms, live: true }); return armed.length; },
      clearTimer: (id) => { if (armed[id - 1]) armed[id - 1].live = false; } });
    await cs.load();
    if (cs.leaveCountdown() !== null) return 'a countdown before any leave: ' + JSON.stringify(cs.leaveCountdown());
    clientT = 1000;
    const pending = cs.leaveHunt();
    for (let i = 0; i < 5 && !release; i++) await new Promise((r) => setImmediate(r));
    if (!release) return 'the settle after the leave was never asked';
    const first = cs.leaveCountdown();
    if (!first || first.phase !== 'counting' || first.s !== 6) return 'no countdown while the settle after the leave is out (want 6 s): ' + JSON.stringify(first);
    const at = (t) => { clientT = t; return cs.leaveCountdown(); };
    const seen = [];
    for (const t2 of [1001, 5999, 6001, 6999, 7000, 7001, 9000, 22999, 23000, 40000]) seen.push([t2, at(t2)]);
    const bad = seen.find(([, c]) => !c || (c.phase === 'counting' && !(c.s >= 1)));
    if (bad) return 'the countdown read 0 or less (or vanished): ' + JSON.stringify(bad);
    const ph = Object.fromEntries(seen.map(([t2, c]) => [t2, c.phase === 'counting' ? c.s : c.phase]));
    const want = { 1001: 6, 5999: 2, 6001: 1, 6999: 1, 7000: 'now', 7001: 'now', 9000: 'now', 22999: 'now', 23000: 'late', 40000: 'late' };
    for (const k of Object.keys(want)) if (ph[k] !== want[k]) return 'the countdown at ' + k + ' ms reads ' + JSON.stringify(ph[k]) + ' (want ' + JSON.stringify(want[k]) + ')';
    /* LATE: the settle answers, the hunt is still open; the close goes on being asked */
    release();
    await pending;
    const live = armed.filter((x) => x.live);
    if (live.length !== 1) return 'a late leave stopped asking for the close: ' + JSON.stringify(live.map((x) => x.ms));
    if (cs.leaveCountdown().phase !== 'late') return 'the late leave lost its phase: ' + JSON.stringify(cs.leaveCountdown());
    /* THE NEXT HUNT: a leave's answer is its own session's only; a new hunt shows no countdown */
    sid = 'h2'; leaving = false;
    await cs.load();
    return cs.leaveCountdown() === null || 'a new hunt shows the last hunt’s leave countdown: ' + JSON.stringify(cs.leaveCountdown());
  });

  const mkAccount = (srv, o = {}) => {
    const tab = memStore();
    const auth = { userId: () => UID, token: () => 'jwt', signOut: async () => { auth.out = true; } };
    return new A.AccountSession({ auth, server: srv, tab, channel: fakeHub().channel, timers, config: o.config });
  };
  const said = (n) => ({ account: { max_concurrent: n } });
  await t('ACC-1', async () => {
    const max = CFG.SESSION_CONFIG.maxConcurrentCharacters;
    const by = {};
    for (let s = 0; s <= max; s++) by[s] = env(1, said(max));
    const acc = mkAccount(fakeServer(by));
    for (let s = 0; s < max; s++) if (!(await acc.open(s)).ok) return 'could not open character ' + s;
    const over = await acc.open(max);
    if (over.ok || over.reason !== 'limit') return 'opened more than ' + max;
    acc.close(0);
    return (await acc.open(max)).ok || 'closing did not free a place';
  });
  await t('ACC-4', async () => {
    const two = mkAccount(fakeServer({ 0: env(1, said(2)), 1: env(1, said(2)), 2: env(1, said(2)) }));
    if (!(await two.open(0)).ok || !(await two.open(1)).ok) return 'the server allowed two and two did not open';
    const third = await two.open(2);
    if (third.ok || third.reason !== 'limit') return 'a third opened over the server limit of two';
    const none = mkAccount(fakeServer({ 0: env(1), 1: env(1) }));
    if (!(await none.open(0)).ok) return 'with no stated limit the first character did not open';
    if ((await none.open(1)).ok) return 'with no stated limit a second character opened: a client number unlocked it';
    const max = CFG.SESSION_CONFIG.maxConcurrentCharacters;
    const by = {};
    for (let s = 0; s <= max; s++) by[s] = env(1, said(8));
    const big = mkAccount(fakeServer(by));
    for (let s = 0; s < max; s++) await big.open(s);
    if ((await big.open(max)).ok) return 'a server limit above the tab ceiling opened past it';
    const ro = mkAccount(fakeServer({ 0: env(1, said(3)) }));
    await ro.roster();
    return ro.limit() === 3 || 'the roster read did not take the server limit (' + ro.limit() + ')';
  });
  await t('VIEW-2', async () => {
    const srv = fakeServer({ 0: env(1, said(4)), 1: env(1, said(4)), 2: env(1, said(4)) });
    const hub = fakeHub();
    const auth = { userId: () => UID, token: () => 'jwt', signOut: async () => {} };
    const acc = new A.AccountSession({ auth, server: srv, tab: memStore(), channel: hub.channel, timers });
    for (const s of [0, 1, 2]) await acc.open(s);
    const heard = [];
    for (const cs of acc.characters()) cs.subscribe((c, why) => heard.push(c.slot + ':' + why));
    const before = acc.characters().map((cs) => [cs.slot, cs.record, cs.status, cs._listeners.size]);
    const topics = Array.from(hub.topics.keys()).sort().join();
    const calls = srv.calls.length;
    if (!acc.view(1) || acc.viewed !== 1 || !acc.view(2) || !acc.view(0) || acc.viewed !== 0) return 'view() did not move the pointer';
    if (acc.view(9)) return 'view() moved to a character that is not open';
    const after = acc.characters().map((cs) => [cs.slot, cs.record, cs.status, cs._listeners.size]);
    if (after.length !== 3 || after.some((a, i) => a.some((v, j) => v !== before[i][j]))) return 'a switch changed a character (record, status or listeners)';
    if (Array.from(hub.topics.keys()).sort().join() !== topics) return 'a switch left or joined a topic';
    if (srv.calls.length !== calls) return 'a switch sent ' + (srv.calls.length - calls) + ' server call(s)';
    return heard.length === 0 || 'a switch made characters emit: ' + heard.join(',');
  });
  await t('ACC-2', async () => {
    /* each hero by its server name and its Level from the server's Level XP (21,591 = Level 10, CORE_MODEL.md §2) */
    const srv = fakeServer({ 0: env(1, { hero_slots: [0, 2, 3, 99, -1, 'x'], name: 'Tester', state: { gold: 1, level_xp: 21591 } }), 2: env(1),
      3: { ok: false, error: 'needs_name', hero_slots: [0, 2, 3] } });
    const acc = mkAccount(srv);
    const r = await acc.roster();
    if (JSON.stringify(r) !== JSON.stringify([{ slot: 0, exists: true, unnamed: false, name: 'Tester', level: 10, gold: 1 }, { slot: 2, exists: true, unnamed: false, name: null, level: null, gold: 1 },
      { slot: 3, exists: false, unnamed: true, name: null, level: null, gold: null }])) return 'roster was ' + JSON.stringify(r);
    srv.calls.length = 0;
    const ok = await acc.create(3, 'Fennick', { head: 1, body: 2, legs: 3, feet: 4 });
    const no = await acc.create(3, 'Taken', { head: 1, body: 2, legs: 3, feet: 4 });
    const sent = srv.calls.filter((c) => c[0] === 'hr_create_hero').map((c) => c[1]);
    if (!ok.ok || no.ok || no.reason !== 'name_taken' || sent.length !== 2 || sent[0].p_slot !== 3 || sent[0].p_name !== 'Fennick'
      || JSON.stringify(sent[0].p_colors) !== '{"head":1,"body":2,"legs":3,"feet":4}' || typeof sent[0].p_idem !== 'string' || sent[0].p_idem === sent[1].p_idem
      || Object.keys(sent[0]).some((k) => /price|gold|item/.test(k))) return 'create sent ' + JSON.stringify(sent) + ' -> ' + JSON.stringify([ok, no]);
    return true;
  });
  await t('ACC-5', async () => {
    const offer = (o) => ({ account: { max_concurrent: 4, hero_slot_offer: o, hero_slots_max: 5 } });
    /* the offer is the server's, bounded; none at the cap, none unstated, none malformed */
    const none = [offer(null), offer({ slot_id: 2, cost_gold: 0 }), offer({ slot_id: 9, cost_gold: 75000 }), offer({ slot_id: 2, cost_gold: '75000' }), {}];
    for (const extra of none) {
      const acc = mkAccount(fakeServer({ 0: env(1, extra) }));
      await acc.roster();
      if (acc.slotOffer !== null) return 'an offer was read from ' + JSON.stringify(extra) + ': ' + JSON.stringify(acc.slotOffer);
    }
    const srv = fakeServer({ 0: env(1, Object.assign({ hero_slots: [0, 1], name: 'Tester', state: { gold: 80000 } }, offer({ slot_id: 2, cost_gold: 75000 }))),
      1: env(1, { name: 'Fennick', state: { gold: 10 } }) });
    const acc = mkAccount(srv);
    const r = await acc.roster();
    if (JSON.stringify(acc.slotOffer) !== '{"slotId":2,"cost":75000,"max":5}' || r[0].gold !== 80000 || r[1].gold !== 10) return 'the roster read ' + JSON.stringify([acc.slotOffer, r]);
    await acc.open(0);
    srv.calls.length = 0;
    const yes = await acc.buySlot(2, 0);
    const no = await acc.buySlot(2, 1);
    const bad = await acc.buySlot(2, 'x');
    const sent = srv.calls.filter((c) => c[0] === 'hr_buy_hero_slot').map((c) => c[1]);
    if (!yes.ok || no.ok || no.reason !== 'insufficient_gold' || no.shortBy !== 400 || bad.ok || sent.length !== 2) return 'buySlot answered ' + JSON.stringify([yes, no, bad, sent]);
    if (Object.keys(sent[0]).sort().join() !== 'p_idem,p_slot,p_slot_id' || sent[0].p_slot_id !== 2 || sent[0].p_slot !== 0
      || typeof sent[0].p_idem !== 'string' || sent[0].p_idem === sent[1].p_idem) return 'buySlot sent ' + JSON.stringify(sent);
    if (!srv.calls.some((c) => c[0] === 'hr_load' && c[1].p_slot === 0)) return 'the paying hero was not re-read after the purchase';
    return JSON.stringify(acc.slotOffer) === '{"slotId":3,"cost":250000,"max":5}' || 'after the purchase the offer is ' + JSON.stringify(acc.slotOffer);
  });
  await t('ACC-3', async () => {
    if (!S.isClosedAnswer(403, { code: 'hr_closed' }) || S.isClosedAnswer(403, { code: 'other' }) || S.isClosedAnswer(200, { code: 'hr_closed' })) return 'isClosedAnswer is wrong';
    const acc = mkAccount(fakeServer({}, { closed: true }));
    let heard = 0; acc.subscribe((w) => { if (w === 'closed-game') heard++; });
    const r = await acc.roster();
    const o = await acc.open(0);
    return (acc.closedGame && heard === 1 && r.length === 0 && !o.ok) || 'the closed game was not noticed';
  });
  await t('NET-1', async () => {
    const urls = [];
    const fetch = async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
    const link = S.createServerLink({ url: NB.SUPABASE_CONFIG.url, anonKey: 'anon', token: () => 'jwt', fetch });
    await link.accrue({ slot: 0 });
    if (NB.SUPABASE_CONFIG.functionRegion !== 'us-west-2') return 'the function region is not the database\'s (us-west-2): ' + NB.SUPABASE_CONFIG.functionRegion;
    const want = NB.SUPABASE_CONFIG.url + '/functions/v1/hr-accrue?forceFunctionRegion=' + NB.SUPABASE_CONFIG.functionRegion;
    return urls[0] === want || 'accrue fetched ' + urls[0] + ', not ' + want;
  });

  await t('OUT-1', async () => {
    const device = memStore(), tab = memStore();
    const cfg = CFG.SESSION_CONFIG;
    for (const s of [device, tab]) { s.set(cfg.authKey, 'tok'); s.set('sb-ref-auth-token', 'tok'); s.set(cfg.authKey + '-code-verifier', 'v'); s.set('keep-me', '1'); }
    for (const k of cfg.retiredAuthKeys) device.set(k, 'old');
    tab.set(cfg.tabKey, 'tab-1');
    let signedOut = false;
    const client = { auth: { signOut: async () => { signedOut = true; }, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) } };
    const auth = AU.createAuth({ client, device, tab, redirectTo: 'https://x/' });
    const srv = fakeServer({ 0: env(1, said(2)), 1: env(1, said(2)) });
    const acc = new A.AccountSession({ auth: Object.assign(auth, { userId: () => UID }), server: srv, tab, channel: fakeHub().channel, timers });
    const c0 = (await acc.open(0)).session, c1 = (await acc.open(1)).session;
    await acc.signOut();
    const left = [...device.keys(), ...tab.keys()].filter((k) => k !== 'keep-me');
    if (left.length) return 'copies left after sign-out: ' + left.join(', ');
    if (device.get('keep-me') !== '1') return 'sign-out removed an unrelated key';
    if (acc.characters().length || c0.status !== 'closed' || c1.status !== 'closed' || c0.record) return 'characters stayed open';
    return signedOut || 'supabase signOut was not called';
  });
  await t('TAB-1', () => {
    const tab = memStore(), other = memStore();
    const a = A.tabSessionId(tab), b = A.tabSessionId(tab), c = A.tabSessionId(other);
    return (a && a === b && a !== c) || 'tab ids: ' + [a, b, c].join(' ');
  });
  await t('COPY-1', async () => {
    const answers = [];
    const mk = (err) => ({ auth: { signUp: async () => ({ data: {}, error: err }), resetPasswordForEmail: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: {} }) } });
    for (const err of [null, { message: 'User already registered', status: 422 }]) {
      const au = AU.createAuth({ client: mk(err), device: memStore(), tab: memStore(), redirectTo: 'https://x/' });
      answers.push((await au.signUp('a@b.co', 'abcdefgh', 'abcdefgh')).message);
      answers.push((await au.requestReset('a@b.co')).message);
    }
    if (answers[0] !== answers[2] || answers[1] !== answers[3]) return 'the copy differs for an existing email';
    if (!/if you already have an account, sign in/i.test(answers[0])) return 'sign-up copy does not point an existing account to sign in';
    const all = Object.values(AU.AUTH_COPY).join(' ');
    return !/open beta|invite code/i.test(all) || 'retired copy (open beta / invite code) is back';
  });

  /* THE TOKEN (TOK-*): the real createAuth over a fake supabase-js auth, the real server link over a fake fetch. */
  const T0 = 1_800_000_000_000;
  const sess = (tok, expMs) => ({ access_token: tok, refresh_token: 'r-' + tok, expires_at: Math.floor(expMs / 1000), user: { id: UID, email: 'qa@x.co' } });
  const tokenRig = (o = {}) => {
    const clock = { t: T0 };
    let stored = o.start || sess('A', T0 + 3600e3);
    const n = { get: 0, refresh: 0 };
    const doc = { visibilityState: 'visible', fns: [], addEventListener(ev, fn) { if (ev === 'visibilitychange') this.fns.push(fn); },
      wake() { this.visibilityState = 'visible'; for (const f of this.fns) f(); } };
    const client = { auth: {
      getSession: async () => { n.get++; return { data: { session: stored } }; },
      refreshSession: async () => {
        n.refresh++;
        await new Promise((r) => setImmediate(r));
        if (o.refuse) return { data: { session: null, user: null }, error: { name: 'AuthApiError', status: 400, message: 'Invalid Refresh Token: Already Used' } };
        stored = sess('B', clock.t + 3600e3);
        return { data: { session: stored }, error: null };
      },
      signOut: async () => {}, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
    const auth = AU.createAuth({ client, device: memStore(), tab: memStore(), redirectTo: 'https://x/', doc, now: () => clock.t });
    const sent = [];
    const fetch = async (url, init) => {
      const tok = init.headers.Authorization.slice(7);
      sent.push(tok);
      const dead = (o.dead || ['A']).includes(tok) && (o.reject401 || tok !== 'B');
      return { ok: !dead, status: dead ? 401 : 200, json: async () => (dead ? { code: 'UNAUTHORIZED' } : { ok: true, accrued: true, version: 1, state: { gold: 1 } }) };
    };
    const server = S.createServerLink({ url: 'https://p', anonKey: 'anon', token: auth.freshToken, renew: auth.renewToken, fetch });
    const heard = [];
    auth.onChange((ev) => heard.push(ev));
    return { clock, auth, server, sent, n, doc, heard };
  };

  await t('TOK-1', async () => {
    const r = tokenRig({ start: sess('A', T0 + 3600e3) });
    await r.auth.refresh();
    r.clock.t = T0 + 3600e3 - 30e3;   // 30 s left: inside the margin
    const ans = await r.server.accrue({ slot: 0 });
    if (r.sent.join() !== 'B') return 'the call sent ' + JSON.stringify(r.sent) + ', not the refreshed token alone';
    return (ans.ok && r.n.refresh === 1) || 'the stale token was not refreshed exactly once before the call (' + r.n.refresh + ')';
  });
  await t('TOK-2', async () => {
    const r = tokenRig();
    await r.auth.refresh();
    const ans = await r.server.rpc('hr_load', { p_slot: 0 });
    if (r.sent.join() !== 'A,B' || !ans.ok) return 'a 401 was not renewed and retried once: sent ' + JSON.stringify(r.sent);
    if (r.n.refresh !== 1) return 'a 401 refreshed ' + r.n.refresh + ' times';
    const r2 = tokenRig({ dead: ['A', 'B'], reject401: true });
    await r2.auth.refresh();
    const a2 = await r2.server.accrue({ slot: 0 });
    return (r2.sent.length === 2 && a2.status === 401) || 'a 401 on the retry was retried again: sent ' + JSON.stringify(r2.sent);
  });
  await t('TOK-3', async () => {
    const r = tokenRig({ refuse: true });
    await r.auth.refresh();
    await r.server.accrue({ slot: 0 });   // 401 → refresh refused
    for (let i = 0; i < 10; i++) await r.server.accrue({ slot: 0 });
    if (r.sent.length !== 1) return 'a dead session sent ' + r.sent.length + ' calls';
    if (r.heard.filter((e) => e === 'expired').length !== 1) return 'the app heard expired ' + r.heard.filter((e) => e === 'expired').length + ' times';
    if (r.auth.token() !== null) return 'the dead token is still held';
    const s = tokenRig({ refuse: true, start: sess('A', T0 + 10e3) });
    await s.auth.refresh();
    for (let i = 0; i < 10; i++) await s.server.accrue({ slot: 0 });
    return (s.sent.length === 0 && s.n.refresh === 1 && s.heard.join() === 'expired') || 'a refused pre-call refresh still sent ' + s.sent.length + ' calls / refreshed ' + s.n.refresh + ' times';
  });
  await t('TOK-4', async () => {
    const r = tokenRig({ start: sess('A', T0 + 20e3) });
    await r.auth.refresh();
    const a = new C.CharacterSession({ slot: 0, uid: UID, server: r.server, ...timers });
    const b = new C.CharacterSession({ slot: 1, uid: UID, server: r.server, ...timers });
    await Promise.all([a.load(), b.load()]);
    if (r.n.refresh !== 1) return 'two characters refreshed ' + r.n.refresh + ' times';
    return (r.sent.length === 2 && r.sent.every((x) => x === 'B')) || 'the two characters did not both carry the one refreshed token: ' + JSON.stringify(r.sent);
  });
  await t('TOK-5', async () => {
    const r = tokenRig({ start: sess('A', T0 + 3600e3) });
    await r.auth.refresh();
    r.doc.visibilityState = 'hidden';
    r.clock.t = T0 + 5 * 3600e3;          // hidden for hours: supabase-js refreshed nothing
    r.doc.wake();
    await new Promise((res) => setImmediate(res)); await new Promise((res) => setImmediate(res));
    if (r.n.refresh !== 1 || r.auth.token() !== 'B') return 'waking the tab did not refresh the token (' + r.n.refresh + ', ' + r.auth.token() + ')';
    await r.server.accrue({ slot: 0 });
    return (r.sent.join() === 'B' && r.n.refresh === 1) || 'the call after waking sent ' + JSON.stringify(r.sent);
  });
  return fails;
}

async function viewRules(base) {
  const fails = [];
  const { worldViewOf } = await import(pathToFileURL(join(base, 'src/app/world-view.js')).href);
  const { HUNTS } = await import(pathToFileURL(join(base, 'src/data/hunts.js')).href);
  const hunt = HUNTS.find((h) => h.spawns && h.spawns.length);
  const scratch = { choice: 'home' };
  const v = worldViewOf({ data: { state: { active_kind: 'combat', active_id: hunt.id }, hunt_analyzer: { kills: 3 } } }, scratch);
  if (v._huntId !== hunt.id || v.activeMonster !== hunt.spawns[0].monster || v._world !== scratch || v._huntAnalyzer.kills !== 3) fails.push('VIEW-1: hunt view wrong ' + JSON.stringify(v));
  const idle = worldViewOf(null, scratch);
  if (idle.activeMonster || idle._huntId || idle._world !== scratch) fails.push('VIEW-1: an unloaded character shows a fight');
  return fails;
}

/* ── THE MUTANTS: each must turn at least one rule red. ── */
const MUTANTS = [
  ['merge, not replace', 'src/session/envelope.js', '  const data = {};\n  for (const k of Object.keys(env))', '  const data = Object.assign({}, current ? current.data : {});\n  for (const k of Object.keys(env))'],
  ['stale accepted', 'src/session/envelope.js', "if (current && env.version < current.version) return keep('stale');", ''],
  ['frame merges inside a key', 'src/session/envelope.js', 'data[k] = copy(f.patch[k]);', 'data[k] = copy(Object.assign({}, current.data[k], f.patch[k]));'],
  ['partial bag accepted', 'src/session/envelope.js', "&& f.patch.inventory_complete !== true) return keep('bag_incomplete');", "&& false) return keep('bag_incomplete');"],
  ['no state accepted', 'src/session/envelope.js', "if (!isObj(env.state)) return keep('incomplete');", ''],
  ['residue unfiltered', 'src/session/residue.js', '  for (const f of RESIDUE_FIELDS) if (Object.prototype.hasOwnProperty.call(bag, f)) out[f] = sanitizeResidueField(f, bag[f]);', '  Object.assign(out, bag);'],
  ['one topic for every slot', 'src/session/character-session.js', "return 'hr:' + uid.toLowerCase() + ':' + slot;", "return 'hr:' + uid.toLowerCase();"],
  ['the slot offer is made up on this side', 'src/session/account-session.js', '    || !Number.isSafeInteger(o.cost_gold) || o.cost_gold < 1) return null;', '    || false) return null;'],
  ['a slot purchase sends a price', 'src/session/account-session.js', "{ p_slot_id: slotId, p_slot: paySlot, p_idem: newIdem() }", "{ p_slot_id: slotId, p_slot: paySlot, p_price: this.slotOffer && this.slotOffer.cost, p_idem: newIdem() }"],
  ['the paying hero keeps its old gold', 'src/session/account-session.js', '      if (cs) await cs.load();\n', ''],
  ['limit off by one', 'src/session/account-session.js', 'if (this._chars.size >= this.limit())', 'if (this._chars.size > this.limit())'],
  ['the client ceiling stands in for the server', 'src/session/account-session.js', 'return Math.min(this.config.maxConcurrentCharacters, this._limit === null ? 1 : this._limit);', 'return this.config.maxConcurrentCharacters;'],
  ['the server limit is ignored above one', 'src/session/account-session.js', 'return Math.min(this.config.maxConcurrentCharacters, this._limit === null ? 1 : this._limit);', 'return Math.min(this.config.maxConcurrentCharacters, this._limit === null ? 1 : this.config.maxConcurrentCharacters);'],
  ['a switch re-reads the viewed character', 'src/session/account-session.js', "    this.viewed = slot;\n    this._emit('viewed', slot);", "    this.viewed = slot;\n    this._chars.get(slot).load();\n    this._emit('viewed', slot);"],
  ['a switch closes the others', 'src/session/account-session.js', "    this.viewed = slot;\n    this._emit('viewed', slot);", "    this.viewed = slot;\n    for (const c of this._chars.values()) if (c.slot !== slot) c._leave && (c._leave(), c._leave = null);\n    this._emit('viewed', slot);"],
  ['sign-out keeps sb-* keys', 'src/net/auth.js', " || k.startsWith('sb-')", ''],
  ['sign-out keeps the tab id', 'src/net/auth.js', '    if (o.tab) o.tab.remove(cfg.tabKey);\n', ''],
  ['sign-out leaves characters open', 'src/session/account-session.js', '    for (const slot of Array.from(this._chars.keys())) this.close(slot);\n', ''],
  ['existing email told apart', 'src/net/auth.js', "if (error && !/already (registered|exists)/i.test(String(error.message || ''))) return fail(AUTH_COPY.signUpFailed);", 'if (error) return fail(AUTH_COPY.signUpFailed);'],
  ['the engine runs in the players\' region', 'src/session/server.js', "post('/functions/v1/hr-accrue?forceFunctionRegion=' + SUPABASE_CONFIG.functionRegion, body)", "post('/functions/v1/hr-accrue', body)"],
  ['the region is not the database\'s', 'src/net/supabase-bootstrap.js', "functionRegion: 'us-west-2',", "functionRegion: 'us-east-2',"],
  ['closed game ignored', 'src/session/server.js', "return status === CLOSED_STATUS && !!body", "return false && !!body"],
  ['a join sends no hello', 'src/session/character-session.js', "if (st === 'SUBSCRIBED') { this._attempt = 0; this.hello(); return; }", "if (st === 'SUBSCRIBED') { this._attempt = 0; return; }"],
  ['a leave inside the channel callback recurses', 'src/session/character-session.js', "    const leave = this._leave;\n    this._leave = null;\n    if (leave) { try { leave(); } catch (e) { /* already gone */ } }", "    if (this._leave) { try { this._leave(); } catch (e) { /* already gone */ } this._leave = null; }"],
  ['a dropped channel is never re-joined', 'src/session/character-session.js', "this._retry = this._setTimer(() => { this._retry = null; this.connect(); }, reconnectDelay(++this._attempt));", "this._retry = null;"],
  ['a version gap is guessed, not healed', 'src/session/character-session.js', "if (before !== null && r.record.version > before + 1) this.hello();", ""],
  ['an open hunt is never re-read', 'src/session/character-session.js', "    this._emit(why);\n    this._armHuntPoll();", "    this._emit(why);"],
  ['an ended hunt keeps re-reading', 'src/session/character-session.js', "typeof h.session_id === 'string' && h.ended !== true;", "typeof h.session_id === 'string';"],
  ['a pending leave waits for the world tick', 'src/session/character-session.js', "      if (!(await this.hello()) && !this._closed) await this.load();", "      await this.load();"],
  ['a refused settle leaves the leave unseen', 'src/session/character-session.js', "      if (!(await this.hello()) && !this._closed) await this.load();", "      await this.hello();"],
  ['the close waits a whole poll past leave_at', 'src/session/hunt-poll.js', "  return closeMs === null ? ms : Math.min(ms, closeMs);", "  return ms;"],
  ['an armed poll is never moved earlier', 'src/session/hunt-poll.js', "      if (!(due < this._due)) return;", "      return;"],
  ['the countdown waits for the settle after the leave', 'src/session/character-session.js', "      this._leaveAsk = leaveAskOf(ans.body.session);\n", ""],
  ['the leave answer is held for another session', 'src/session/hunt-leave.js', "ask.session === h.session_id ? ask.at : null", "ask.at"],
  ['the countdown reads 0 past leave_at', 'src/session/hunt-leave.js', "  if (left > 0) return { phase: 'counting', s: Math.ceil(left / 1000) };", "  if (left > -SESSION_CONFIG.leaveLateMs) return { phase: 'counting', s: Math.ceil(left / 1000) };"],
  ['a late leave is never told apart', 'src/session/hunt-leave.js', "phase: left > -SESSION_CONFIG.leaveLateMs ? 'now' : 'late'", "phase: 'now'"],
  ['the close is timed on the device clock', 'src/session/character-session.js', "  serverNow() { return this.timeline.serverNowAt(this._now()); }", "  serverNow() { return Date.now(); }"],
  ['a stale token is sent as it is', 'src/net/auth.js', '    if (lasts(session)) return tokenOf(session);\n    if (!session) return null;', '    if (session) return tokenOf(session);\n    if (!session) return null;'],
  ['a 401 is not renewed', 'src/session/server.js', 'if (res.status === 401 && o.renew)', 'if (false && o.renew)'],
  ['every caller refreshes on its own', 'src/net/auth.js', '    if (renewing) return renewing;\n', ''],
  ['a refused refresh keeps the dead session', 'src/net/auth.js', "    session = null;\n    tell('expired');", "    tell('expired');"],
  ['waking a hidden tab checks nothing', 'src/net/auth.js', "if (o.doc.visibilityState === 'visible') freshToken();", "if (false) freshToken();"],
  ['a failed live ask re-arms at once, forever', 'src/session/character-session.js', 'if (!took) this.liveLink.missed();', ''],
  ['the live ask gives up after two tries', 'src/session/live-link.js', '      this.want = true;\n      this._tries++;', '      this.want = this._tries < 2;\n      if (this.want) this._tries++;'],
  ['an idle settle replaces the character', 'src/session/character-session.js', "if (ans.ok && ans.body && ans.body.accrued !== true) return this.load();", ""],
];

function copyTree(dst) {
  mkdirSync(join(dst, 'src/net'), { recursive: true });
  cpSync(join(ROOT, 'src/session'), join(dst, 'src/session'), { recursive: true });
  cpSync(join(ROOT, 'src/net/auth.js'), join(dst, 'src/net/auth.js'));
  cpSync(join(ROOT, 'src/net/supabase-bootstrap.js'), join(dst, 'src/net/supabase-bootstrap.js'));
  /* The CharacterSession runs the live hunt view (option B), so the engine and the data come along. */
  for (const d of ['src/hunt-view', 'src/data', 'src/core']) cpSync(join(ROOT, d), join(dst, d), { recursive: true });
}

async function main() {
  const mutate = process.argv.includes('--mutate');
  if (!mutate) {
    const fails = [...await rules(await load(ROOT)), ...await viewRules(ROOT)];
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'session-core: ' + fails.length + ' rule(s) RED' : 'session-core: every session rule holds (33 rules)');
    process.exit(fails.length ? 1 : 0);
  }
  let bad = 0;
  const clean = await rules(await load(ROOT));
  if (clean.length) { console.log('  ✗ clean control is RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  for (const [name, file, from, to] of MUTANTS) {
    const tmp = mkdtempSync(join(tmpdir(), 'hr-session-'));
    try {
      copyTree(tmp);
      const text = readFileSync(join(tmp, file), 'utf8');
      if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
      writeFileSync(join(tmp, file), text.replace(from, to));
      const fails = await rules(await load(tmp));
      if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(':')[0] + ')');
      else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(bad ? 'session-core --mutate: ' + bad + ' mutant(s) escaped' : 'session-core --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}
main();
