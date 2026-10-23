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
//   ENV-3  a frame is the whole character (2026-12-25-frame-push-revive.sql): it REPLACES the record like
//          a load (a key it lacks is gone) and carries the residue its envelope holds
//   ENV-4  frames: not before the first load, never duplicate/reorder, never a frame whose number is not
//          its envelope's version
//   ENV-5  malformed / not ok / no `state` answers change nothing
//   ENV-6  the record is frozen and never aliases the server's object
//   RES-1  the residue is an allowlist: unknown client_state fields never arrive
//   ISO-1  two characters never share a record, a topic, a listener or a residue write
//   ISO-2  a frame for one character changes only that one
//   CHAN-1 every join of a character's topic re-reads the character once (hello); a dropped
//          channel is left and re-joined after a backoff
//   CHAN-3 a leave from inside the channel's own status callback (removeChannel echoes CLOSED)
//          leaves once and schedules one reconnect, never recursing (live v0.2.6)
//   CHAN-2 a frame never asks the engine, not even across a version gap: the frame IS the state
//   HUNT-3 a frame while a hunt is open DEFERS the re-read a whole delay (the poll is the fallback): a
//          character fed by frames sends no hello while the frames come
//   ASK-1  one character sustains at most 6 engine asks a minute (the accrue budget is the ACCOUNT's 30): a
//          frame never asks (it is the whole character) and a re-join while hunting asks nothing (the armed
//          re-read restates it), a refusal holds the asking, in town one hello is in flight and a re-join storm
//          is paced yet caught up (live 10-23)
//   ASK-2  a four-hero leave-together: a not-due answer at the record's version is not re-read in full, the close
//          is backed off past leave_at; no refusal, at most 7 asks and 2 full reads a hero, every hero sees its end
//   ASK-3  a hunter's idle answer at a version its record holds WHOLE (a load, a settle answer, or ANY pushed frame:
//          a frame is the whole character) is not re-read in full; in town it always is (a party invite moves no version)
//   HELLO-1 an idle settle answer ({accrued:false}) is never applied as the character: the full read follows
//   HUNT-1 while the server holds a hunt open the character asks the hunter's settle every huntPollMs
//          (attended): the track reaches the timeline; the envelope that says it ended stops the asking
//   TOWN-1 while the Work window or the bag watches town work (a node or a bench the server holds) the
//          viewed character asks one settle per townPollMs, never two in flight, never for an idle hero
//          or a hunter; the answer replaces the bag (Tyler 2026-10-22: "the bag needs to update in real time")
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
//   VIEW-2 switching the viewed character asks the newly viewed one ONE settle and nothing else: statuses,
//          topics, listeners and every other character's calls are exactly as before
//   VIEW-3 only the viewed character streams live (CLAUDE.md §6): in a four-hero party hunt the viewed one asks
//          at most 5 a minute, an unviewed one makes at most 1 call a minute and never asks the engine; a switch
//          shows the server's state at once; an unviewed hero's hunt end reaches its record within a minute
//   ACC-2  the roster is the server's owned slots (hero_slots), bounded; a slot whose
//          character has no name (hr_load needs_name) reads as unnamed, not as a hero;
//          create is ONE hr_create_hero with the name, the four colours and an idem key
//   ACC-5  a hero slot is bought at the SERVER's offer (account.hero_slot_offer; none at the cap or
//          unstated): ONE hr_buy_hero_slot with the slot, the paying hero and a fresh idem key, no
//          price; a refusal comes back by name (short_by kept); a yes re-reads the open paying hero
//   ACC-FARM the farm land is the account's: hero 0 plants and hero 1 (open beside it) sees the plot
//          at once; hero 1 harvests it as itself (its slot) and hero 0 sees it gone
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
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { harnessFail, judge, report, exitOf, cleanControl } from './_mutant-verdict.mjs';

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
    TP: await import(u('src/session/town-poll.js')),
    I: await import(u('src/session/item-sections.js')),
    FI: await import(u('src/session/farm-intents.js')),
    FS: await import(u('src/session/farm-sections.js')),
  };
}

const UID = '11111111-2222-3333-4444-555555555555';
const env = (version, extra) => Object.assign({ ok: true, version, state: { gold: 1 } }, extra || {});
/** A pushed frame as hr_frame_payload sends it: the whole envelope at its own version. */
const sframe = (version, extra) => ({ t: 'state', frame: version, env: env(version, extra) });

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
        : { ok: true, slot_id: args.p_slot_id, gold: 5, hero_slots: [0, 1, 2], hero_slot_offer: { slot_id: 3, cost_gold: 40000 }, hero_slots_max: 5 });
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
  const t = async (id, fn) => { try { const r = await fn(); if (r !== true) fails.push(id + ': ' + r); } catch (e) { fails.push(harnessFail(id, e)); } };
  const { E, R, C, A, S, AU, NB, CFG, TP, I, FI, FS } = M;

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
  await t('ENV-3', async () => {
    const hud = { hudLayout: { desktop: { vitals: { visible: false } } } };
    const srv = fakeServer({ 0: env(1, { skills: { mining: 5, attack: 3 }, equipment: { head: 'x' } }) });
    const hub = fakeHub();
    const cs = new C.CharacterSession({ slot: 0, uid: UID, server: srv, channel: hub.channel, ...timers });
    await cs.load(); cs.connect();
    hub.send(C.frameTopic(UID, 0), sframe(2, { skills: { attack: 4 }, client_state: hud }));
    if (cs.record.version !== 2) return 'a fresh frame was refused: ' + cs.lastVerdict;
    if ('mining' in cs.read('skills')) return 'a frame merged inside a key';
    if ('equipment' in cs.record.data) return 'a key the whole-character frame lacks survived (merged, not replaced)';
    return (cs.record.residue.hudLayout && cs.record.residue.hudLayout.desktop.vitals.visible === false) || 'the frame\'s residue was not taken';
  });
  await t('ENV-4', () => {
    if (E.frameEnvelope(null, sframe(1)).verdict !== 'not_loaded') return 'a frame applied before the first load';
    const a = E.applyEnvelope(null, env(5)).record;
    if (E.frameEnvelope(a, sframe(5)).verdict !== 'duplicate') return 'duplicate applied';
    if (E.frameEnvelope(a, sframe(4)).verdict !== 'reorder') return 'reorder applied';
    if (E.frameEnvelope(a, { t: 'state', frame: 7, env: env(6) }).env) return 'a frame whose number is not its envelope\'s version was taken';
    return E.frameEnvelope(a, sframe(6)).env !== null || 'a fresh frame was refused';
  });
  await t('ENV-5', () => {
    const a = E.applyEnvelope(null, env(2)).record;
    for (const bad of [null, [], { ok: false, error: 'rate_limited', version: 9 }, { ok: true, version: 'x', state: {} }, { ok: true, version: 9 },
      { ok: true, version: 9, state: [] }]) {
      const r = E.applyEnvelope(a, bad);
      if (r.applied || r.record !== a) return 'applied a bad answer: ' + JSON.stringify(bad);
    }
    for (const bad of [{ t: 'delta', frame: 3, patch: { state: {} } }, { t: 'x', frame: 3, env: env(3) }, { t: 'state', frame: -1, env: env(-1) },
      { t: 'state', frame: 3, env: { ok: true, version: 3 } }, { t: 'state', frame: 3, env: { ok: false, version: 3, state: {} } }, { t: 'state', frame: 3 }]) {
      if (E.frameEnvelope(a, bad).env) return 'took a bad frame: ' + JSON.stringify(bad);
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
    hub.send(C.frameTopic(UID, 0), sframe(2, { state: { gold: 50 } }));
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
    const n0 = srv.calls.length;
    hub.send(C.frameTopic(UID, 0), sframe(2, { state: { gold: 2 } }));
    if (srv.calls.length !== n0) return 'a next-version frame asked the server';
    hub.send(C.frameTopic(UID, 0), sframe(5, { state: { gold: 5 } }));
    await new Promise((r) => setImmediate(r));
    if (srv.calls.length !== n0) return 'a version gap asked the server: ' + srv.calls.slice(n0).map((c) => c[0]).join(',');
    return (cs.record.version === 5 && cs.read('state').gold === 5) || 'the frame past the gap was not applied whole';
  });
  /* HUNT-3 (2026-12-25-frame-push-revive.sql): a frame while a hunt is open is the settle the re-read would have
     fetched (another member's hello, the world tick), so the re-read waits a whole delay from the frame. */
  await t('HUNT-3', async () => {
    const open = (v) => env(v, { hunt: { session_id: 'h1', hunt_id: 'mill_cellar', ended: false } });
    const srv = fakeServer({ 0: open(1) });
    const hub = fakeHub();
    let clock = 0, seq = 0;
    const armed = new Map();
    const cs = new C.CharacterSession({ slot: 0, uid: UID, server: srv, channel: hub.channel, now: () => clock,
      setTimer: (fn, ms) => { armed.set(++seq, { fn, at: clock + ms }); return seq; }, clearTimer: (id) => { armed.delete(id); } });
    await cs.load(); cs.connect();
    const due = () => Math.min(...Array.from(armed.values()).map((a) => a.at));
    const first = due();
    if (armed.size !== 1 || !Number.isFinite(first)) return 'an open hunt armed ' + armed.size + ' re-reads';
    clock = first - 1;
    hub.send(C.frameTopic(UID, 0), { t: 'state', frame: 2, env: open(2) });
    if (cs.record.version !== 2) return 'the frame was not applied: ' + cs.lastVerdict;
    if (armed.size !== 1) return 'a frame left ' + armed.size + ' re-reads armed (one timer per session)';
    if (!(due() > first)) return 'a frame did not defer the re-read (still due at ' + due() + ', armed for ' + first + ')';
    return srv.calls.filter((c) => c[0] === 'accrue').length === 0 || 'a frame asked the engine';
  });
  /* ASK-1 (live 10-23, Andy's four-hero party: 1,906 `rate_limited` refusals in a day). hr_rate_gate's accrue
     budget, 30 a minute, is the ACCOUNT's (hr_rate_counters is keyed on user and bucket), so ONE character
     sustains at most 6 asks a minute (ask-pacer.js: a bucket of a minute's asks), whoever asks. HUNTING, four
     sessions of one account in one party for 10 simulated minutes: every settle moves each member's version by 2
     and pushes the gap frame to the other three, every channel re-joins each 20 s, a second device spends 20 a
     minute of the same budget and the gate refuses past 30. Each hero stays <= 6 a minute; a gap or a join asks
     nothing (the armed re-read restates the whole character within one poll); a refusal holds the asking and
     shows nothing. TOWN: a gap asks one hello, one in flight however many frames come; a gap frame every 2 s for
     5 minutes costs at most a minute's burst plus 6 a minute, and the last gap is still caught up. */
  await t('ASK-1', async () => {
    const PER = 6, BURST = 8, LAT = 800, MIN = 60000, POLL = CFG.SESSION_CONFIG.huntPollMs, HOLD = CFG.SESSION_CONFIG.liveRefillMs;
    if (CFG.SESSION_CONFIG.engineAsksPerMin > PER || CFG.SESSION_CONFIG.engineAskBurst > BURST || PER * CFG.SESSION_CONFIG.maxConcurrentCharacters >= 30) return 'four heroes may ask past the account\'s 30 a minute';
    const clock = { t: 0 };
    let tid = 0, from = 'timer', hunting = true, lastSettle = -Infinity;
    const timers = new Map(), late = [], frames = [], rejoins = [], ver = [10, 20, 30, 40], errors = [];
    const tm = { setTimer: (fn, ms) => { timers.set(++tid, { fn, at: clock.t + Math.max(0, ms) }); return tid; }, clearTimer: (i) => timers.delete(i), now: () => clock.t };
    const gate = { start: -Infinity, n: 0 };
    const spend = () => { if (gate.start + MIN <= clock.t) { gate.start = clock.t; gate.n = 0; } return ++gate.n <= 30; };
    const asks = [[], [], [], []], refused = [[], [], [], []], restated = [[], [], [], []];
    const envOf = (s) => env(ver[s], { hunt: { session_id: 'h' + s, hunt_id: 'mill_cellar', ended: !hunting } });
    const srvFor = (s) => ({
      rpc: async () => ({ ok: true, status: 200, body: envOf(s), closed: false }),
      accrue: () => {
        asks[s].push({ at: clock.t, from, hunting });
        const snap = envOf(s);   // the server reads the character as the ask arrives
        const ok = spend();
        return new Promise((resolve) => late.push({ at: clock.t + LAT, run: () => {
          if (!ok) { refused[s].push(clock.t); return resolve({ ok: false, status: 429, body: { ok: false, error: 'rate_limited' }, closed: false }); }
          let body = snap;
          if (hunting && clock.t - lastSettle >= 15000) {   // the party settle: every member's version moves twice; the others get a frame
            lastSettle = clock.t;
            for (let k = 0; k < 4; k++) ver[k] += 2;
            for (let k = 0; k < 4; k++) if (k !== s) frames.push({ at: clock.t + 150, k, v: ver[k] });
            body = envOf(s);
          }
          restated[s].push(clock.t);
          resolve({ ok: true, status: 200, body: Object.assign({ accrued: true }, body), closed: false });
        } }));
      },
    });
    const joins = [];
    const css = [0, 1, 2, 3].map((s) => new C.CharacterSession({ slot: s, uid: UID, server: srvFor(s), ...tm,
      channel: (topic, onMessage, onStatus) => { joins[s] = { onMessage, onStatus }; return () => {}; } }));
    const settle = async () => { for (let k = 0; k < 6; k++) await new Promise((r) => setImmediate(r)); };
    const run = async (untilMs, o) => {
      for (; clock.t < untilMs; clock.t += 100) {
        await new Promise((r) => setImmediate(r));   // what the last tick started runs at its own instant
        for (let i = 0; i < late.length; i++) if (late[i] && late[i].at <= clock.t) { const l = late[i]; late[i] = null; l.run(); await settle(); }
        /* the server moves hero 1 with no frame (a party invite, another device) and it re-joins its topic: a hello */
        if (o.rejoinEvery && clock.t % o.rejoinEvery === 0) { ver[1] += 2; rejoins.push({ at: clock.t }); }
        for (let i = 0; i < rejoins.length; i++) if (rejoins[i] && rejoins[i].at <= clock.t) {
          rejoins[i] = null; from = 'join'; if (joins[1]) joins[1].onStatus('SUBSCRIBED'); from = 'timer'; await settle();
        }
        /* a pushed frame is the WHOLE character (2026-12-25-frame-push-revive.sql): a restatement that asks nothing */
        for (let i = 0; i < frames.length; i++) if (frames[i] && frames[i].at <= clock.t) {
          const f = frames[i]; frames[i] = null; from = 'frame';
          if (joins[f.k] && joins[f.k].onMessage({ t: 'state', frame: f.v, env: Object.assign(envOf(f.k), { version: f.v }) })) restated[f.k].push(clock.t);
          from = 'timer'; await settle();
        }
        if (o.joins && clock.t % 20000 === 0) for (const j of joins) { from = 'join'; j.onStatus('SUBSCRIBED'); from = 'timer'; await settle(); }
        if (o.other && clock.t % Math.floor(MIN / o.other) === 0) spend();
        for (const [i, x] of Array.from(timers)) if (x.at <= clock.t && timers.has(i)) { timers.delete(i); x.fn(); await settle(); }
      }
    };
    /* the most asks of `list` in any window of `w` ms */
    const most = (list, w) => Math.max(0, ...list.map((x) => list.filter((y) => y.at >= x.at && y.at < x.at + w).length));
    /* the heroes open 4.1 s apart (a player opens them one by one), so their asks are not in lockstep */
    for (const cs of css) { cs.subscribe((c, why) => { if (why === 'error') errors.push(c.slot); }); await cs.load(); cs.connect(); await run(clock.t + 4100, {}); }
    /* five minutes on our own. Past the first minute (four live views backing off from no start point may
       meet the gate there once: a burst, held) the gate never refuses and every gap is restated by the next poll */
    await run(5 * MIN, { joins: true });
    for (let s = 0; s < 4; s++) for (let i = 1; i < restated[s].length; i++) {
      const w = restated[s][i] - restated[s][i - 1];
      if (restated[s][i - 1] >= MIN && w > POLL + LAT + 1000) return 'hero ' + s + ' went ' + w + ' ms without a whole restatement while hunting (a gap waits past one poll)';
    }
    if (refused.some((r) => r.some((x) => x >= MIN))) return 'four heroes of one account met the account gate on their own';
    /* five more with a second device on the same budget: the gate refuses, and each refusal holds the asking */
    await run(10 * MIN, { joins: true, other: 20 });
    for (let s = 0; s < 4; s++) {
      const a = asks[s].filter((x) => x.hunting);
      if (a.length > PER * 10) return 'hero ' + s + ' asked the engine ' + a.length + ' times in 10 minutes of a party hunt (budget ' + PER + ' a minute)';
      const extra = a.filter((x) => x.from !== 'timer');
      if (extra.length) return 'hunting, hero ' + s + ' asked ' + extra.length + ' hellos of its own for a ' + extra[0].from + ' (the armed re-read restates it)';
      for (const r of refused[s]) { const again = asks[s].find((x) => x.at > r && x.at < r + HOLD); if (again) return 'hero ' + s + ' asked again ' + (again.at - r) + ' ms after a refusal (hold ' + HOLD + ')'; }
    }
    if (!refused.some((r) => r.length)) return 'the harness never met the account gate (the hold is untested)';
    if (errors.length) return 'a refusal showed the player an error (heroes ' + errors.join(',') + ')';
    /* TOWN: the hunt ends. A minute later six FRAMES ask nothing (each is the whole character, applied as it
       stands); six RE-JOINS inside one round trip (the server moved hero 1 with no frame) ask ONE hello in flight
       and ONE after it */
    hunting = false;
    await run(12 * MIN, {});
    let mark = asks[1].length;
    for (let i = 0; i < 6; i++) { ver[1] += 2; frames.push({ at: clock.t + 100 * i, k: 1, v: ver[1] }); }
    await run(clock.t + 2000, {});
    if (asks[1].length !== mark) return 'six frames in town asked ' + (asks[1].length - mark) + ' hellos (a frame is the whole character)';
    if (css[1].record.version !== ver[1]) return 'the last of six frames in town was not applied whole (' + css[1].record.version + ' of ' + ver[1] + ')';
    mark = asks[1].length;
    for (let i = 0; i < 6; i++) { ver[1] += 2; rejoins.push({ at: clock.t + 100 * i }); }
    await run(clock.t + POLL, {});
    const burst = asks[1].slice(mark);
    if (burst.length !== 2 || burst[0].from !== 'join') return 'six re-joins in town asked ' + burst.length + ' hellos (one in flight, one after it)';
    /* the first answer predates the last five moves; the one after it restates the whole character at the server's version */
    const rec = css[1].record;
    if (rec.version !== ver[1] || rec.data.state.gold !== 1) return 'the re-join burst was not restated by a whole answer at the server\'s version (' + rec.version + ' of ' + ver[1] + ')';
    /* a re-join every 2 s for 5 minutes while a second device spends 40 a minute: a minute's burst, then 6 a
       minute, each refusal held; then the last move is still restated by a whole answer (owed, never dropped) */
    const from5 = asks[1].length, held = refused[1].length;
    await run(clock.t + 5 * MIN, { rejoinEvery: 2000, other: 40 });
    const storm = asks[1].slice(from5), lastGap = clock.t - 2000;
    if (storm.length > BURST + PER * 5 || most(storm, MIN) > BURST + PER) return 'a re-join every 2 s asked ' + storm.length + ' hellos in 5 minutes (' + most(storm, MIN) + ' in one minute)';
    await run(clock.t + 2 * MIN, {});
    if (!restated[1].some((x) => x > lastGap)) return 'the last move of the storm was never caught up by a whole answer';
    /* the account's minute filled by the other device: a re-join's hello is refused, held, owed and asked again until it lands */
    await run(clock.t + 16000, { other: 120 });
    const gapAt = clock.t;
    ver[1] += 2; rejoins.push({ at: gapAt });
    await run(clock.t + 30000, { other: 120 });
    await run(clock.t + 2 * MIN, {});
    if (!refused[1].some((x) => x > gapAt)) return 'the full gate never refused the re-join\'s hello (the catch-up is untested)';
    if (!restated[1].some((x) => x > gapAt)) return 'a re-join whose hello was refused was never caught up';
    /* a full gate with the hero's own budget rested: every refusal holds the asking (never re-asked at once) */
    await run(clock.t + 30000, { rejoinEvery: 3000, other: 120 });
    const townRefused = refused[1].slice(held);
    if (!townRefused.length) return 'the town never met the account gate (the hold is untested there)';
    for (const r of townRefused) { const again = asks[1].find((x) => x.at > r && x.at < r + HOLD); if (again) return 'in town hero 1 asked again ' + (again.at - r) + ' ms after a refusal (hold ' + HOLD + ')'; }
    return true;
  });
  /* ASK-2 (perf audit 10-23: a four-hero leave-together cost 37 s, 85 calls and 18 refusals). Four sessions of
     one account leave their party hunt at once; the server closes the instance late (15 s past leave_at, inside
     leaveLateMs). Every not-due answer carries the record's own version, so it is NOT re-read in full (hr_load);
     the close is asked a hair after leave_at and then backed off (2, 2.4, 4.8, 9.6 s), so the leave meets no
     refusal, costs each hero at most 7 engine asks and 2 full reads, and every hero sees its hunt end. */
  await t('ASK-2', async () => {
    const S0 = Date.parse('2031-01-01T00:00:00Z'), LAT = 800, MIN = 60000, LEAVE_IN = 7000, CLOSE_LATE = 15000;
    const clock = { t: 0 };
    let tid = 0, leaveAt = null, closed = false;
    const timers = new Map(), late = [], ver = [10, 20, 30, 40];
    const tm = { setTimer: (fn, ms) => { timers.set(++tid, { fn, at: clock.t + Math.max(0, ms) }); return tid; }, clearTimer: (i) => timers.delete(i), now: () => clock.t };
    const gate = { start: -Infinity, n: 0 };
    const spend = () => { if (gate.start + MIN <= clock.t) { gate.start = clock.t; gate.n = 0; } return ++gate.n <= 30; };
    const calls = [[], [], [], []], refused = [];
    const iso = (ms) => new Date(ms).toISOString();
    const huntOf = (s) => ({ session_id: 'h' + s, hunt_id: 'mill_cellar', ended: closed,
      session: { id: 'h' + s, leave_at: leaveAt === null || closed ? null : iso(leaveAt), phase: leaveAt === null ? 'hunting' : 'leaving' } });
    const envOf = (s) => env(ver[s], { now: iso(S0 + clock.t), hunt: huntOf(s) });
    const srvFor = (s) => ({
      rpc: async (name) => {
        calls[s].push({ at: clock.t, name });
        if (name === 'hr_hunt_leave') {
          if (leaveAt === null) leaveAt = S0 + clock.t + LEAVE_IN;
          return { ok: true, status: 200, body: { ok: true, pending: true, session: { id: 'h' + s, leave_at: iso(leaveAt) } }, closed: false };
        }
        return { ok: true, status: 200, body: envOf(s), closed: false };
      },
      accrue: () => {
        calls[s].push({ at: clock.t, name: 'accrue' });
        const ok = spend();
        return new Promise((resolve) => late.push({ at: clock.t + LAT, run: () => {
          if (!ok) { refused.push({ s, at: clock.t }); return resolve({ ok: false, status: 429, body: { ok: false, error: 'rate_limited' }, closed: false }); }
          /* the close: the first ask CLOSE_LATE past leave_at ends every member (each version moves) */
          if (!closed && leaveAt !== null && S0 + clock.t >= leaveAt + CLOSE_LATE) {
            closed = true;
            for (let k = 0; k < 4; k++) ver[k] += 1;
            return resolve({ ok: true, status: 200, body: Object.assign({ accrued: true }, envOf(s)), closed: false });
          }
          /* the hunt closed by another member's settle: a town answer at the new version (no state) */
          if (closed) return resolve({ ok: true, status: 200, body: { ok: true, accrued: false, reason: 'idle', version: ver[s], now: iso(S0 + clock.t) }, closed: false });
          /* still open: the settle is not due, the record's own version and state */
          resolve({ ok: true, status: 200, body: Object.assign(envOf(s), { accrued: false, settled: false, reason: 'not_due' }), closed: false });
        } }));
      },
    });
    const css = [0, 1, 2, 3].map((s) => new C.CharacterSession({ slot: s, uid: UID, server: srvFor(s), ...tm }));
    for (const cs of css) await cs.load();
    const settle = async () => { for (let k = 0; k < 6; k++) await new Promise((r) => setImmediate(r)); };
    const run = async (untilMs) => {
      for (; clock.t < untilMs; clock.t += 100) {
        await new Promise((r) => setImmediate(r));   // what the last tick started runs at its own instant
        for (let i = 0; i < late.length; i++) if (late[i] && late[i].at <= clock.t) { const l = late[i]; late[i] = null; l.run(); await settle(); }
        for (const [i, x] of Array.from(timers)) if (x.at <= clock.t && timers.has(i)) { timers.delete(i); x.fn(); await settle(); }
      }
    };
    await run(2 * MIN);
    const from = clock.t;
    const leaving = css.map((cs) => cs.leaveHunt());
    await run(from + LEAVE_IN + CLOSE_LATE + CFG.SESSION_CONFIG.leaveLateMs);
    if ((await Promise.all(leaving)).some((r) => !r.ok)) return 'a pending leave was refused';
    const met = refused.filter((r) => r.at >= from);
    if (met.length) return 'the leave met ' + met.length + ' refusals of the account gate';
    for (let s = 0; s < 4; s++) {
      const c = calls[s].filter((x) => x.at >= from);
      const asks = c.filter((x) => x.name === 'accrue').length, reads = c.filter((x) => x.name === 'hr_load').length;
      if (asks > 7 || reads > 2) return 'hero ' + s + '\'s leave cost ' + asks + ' engine asks and ' + reads + ' full reads (at most 7 and 2)';
      if (!(css[s].record.data.hunt && css[s].record.data.hunt.ended === true)) return 'hero ' + s + ' never saw its hunt end';
    }
    return true;
  });
  /* ASK-3 (the version a hunter's idle answer is checked against): a frame is the WHOLE character
     (2026-12-25-frame-push-revive.sql), so a record raised by any frame, one that skipped versions included, is
     whole at its version and an idle answer at it asks nothing more (no hr_load). In town it always is re-read. */
  await t('ASK-3', async () => {
    const calls = [];
    let ver = 10, ended = false;
    const body = () => env(ver, { hunt: { session_id: 'h1', hunt_id: 'mill_cellar', ended } });
    const srv = {
      rpc: async (name) => { calls.push(name); return { ok: true, status: 200, body: body(), closed: false }; },
      accrue: async () => { calls.push('accrue'); return { ok: true, status: 200, body: Object.assign(body(), { accrued: false, settled: false, reason: 'not_due' }), closed: false }; },
    };
    const hub = fakeHub();
    const cs = new C.CharacterSession({ slot: 0, uid: UID, server: srv, channel: hub.channel, ...timers });
    await cs.load(); cs.connect();
    const topic = C.frameTopic(UID, 0);
    const ask = async () => { calls.length = 0; await cs.hello(); await new Promise((r) => setImmediate(r)); return calls.join(','); };
    if ((await ask()) !== 'accrue') return 'an idle answer at the version just read whole was re-read';
    ver = 12; hub.send(topic, { t: 'state', frame: 12, env: body() });
    if (cs.record.version !== 12) return 'the frame that skipped a version was not applied: ' + cs.lastVerdict;
    if ((await ask()) !== 'accrue') return 'an idle answer after a (whole) frame that skipped a version was re-read: ' + calls.join(',');
    ver = 13; hub.send(topic, { t: 'state', frame: 13, env: body() });
    if ((await ask()) !== 'accrue') return 'an idle answer after a consecutive frame was re-read: ' + calls.join(',');
    /* in town an idle answer is always read in full (what no version moves, a party invite, still arrives) */
    ended = true; await cs.load();
    return (await ask()) === 'accrue,hr_load' || 'an idle answer in town was not re-read in full: ' + calls.join(',');
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

  /* EQUIP-1 (tracker r16, "equipping answers at once"): an engine intent's answer IS the envelope (hr-accrue
     answers hr_state_of after its commit): it is applied as it stands, ONE round trip, no hr_load after it.
     An answer without an envelope, or one older than the record, still re-reads; an RPC intent always re-reads. */
  await t('EQUIP-1', async () => {
    const calls = [];
    let body = Object.assign({ ok: true, verb: 'equip' }, env(5, { equipment: { weapon: 'iron_sword' } }));
    const srv = {
      /* An RPC intent's answer is never the character, even one shaped like an envelope. */
      rpc: async (name) => { calls.push(name); return { ok: true, status: 200, body: name === 'hr_load' ? env(4, { equipment: {} }) : env(9, { equipment: { weapon: 'ghost' } }), closed: false }; },
      accrue: async () => { calls.push('accrue'); return { ok: true, status: 200, body, closed: false }; },
    };
    const cs = new C.CharacterSession({ slot: 0, uid: UID, server: srv, ...timers });
    await cs.load();
    const r = await cs.edgeIntent('equip', { equip: { weapon: 'iron_sword' } });
    if (!r.ok) return 'the equip answered ' + JSON.stringify(r);
    if (calls.join(',') !== 'hr_load,accrue') return 'the equip cost more than one round trip: ' + calls.join(',');
    if (cs.record.version !== 5 || cs.record.data.equipment.weapon !== 'iron_sword') return 'the equip answer was not applied';
    body = { ok: true };
    await cs.edgeIntent('equip', { equip: { weapon: null } });
    if (calls.join(',') !== 'hr_load,accrue,accrue,hr_load') return 'an answer with no envelope did not re-read: ' + calls.join(',');
    body = Object.assign({ ok: true }, env(2, { equipment: {} }));
    await cs.edgeIntent('equip', { equip: { weapon: null } });
    if (calls.slice(-2).join(',') !== 'accrue,hr_load' || cs.record.version === 2) return 'a stale answer was applied or not re-read: ' + calls.join(',');
    await cs.lockItem('iron_sword', true);
    return calls.slice(-2).join(',') === 'hr_item_lock,hr_load' || 'an RPC intent no longer re-reads: ' + calls.join(',');
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
  /* TOWN-1 (Tyler 2026-10-22, "the bag needs to update in real time, not when it's done"): the shell's display
     tick calls watchTown while the Work window or the bag is open; a town pointer the server holds is re-read
     once per townPollMs (just over the engine's 15 s town floor), and the answer replaces the bag. */
  await t('TOWN-1', async () => {
    let clock = 1000;
    const work = (v, inv) => env(v, { state: { gold: 1, active_kind: 'artisan', active_id: 'cook_shrimp' }, inventory: inv });
    const calls = [];
    let release = null;
    const srv = {
      rpc: async (name) => { calls.push(name); return { ok: true, status: 200, body: work(1, { raw_shrimp: 40 }), closed: false }; },
      accrue: async (b) => {
        calls.push('accrue:' + b.slot);
        await new Promise((r) => { release = r; });
        return { ok: true, status: 200, body: Object.assign({ accrued: true }, work(2, { raw_shrimp: 28, shrimp: 12 })), closed: false };
      },
    };
    const cs = new C.CharacterSession({ slot: 0, uid: UID, server: srv, now: () => clock, ...timers });
    await cs.load();
    clock += CFG.SESSION_CONFIG.townPollMs - 1;
    if (TP.watchTown(cs)) return 'it asked before townPollMs had passed since the last answer';
    clock += 1;
    if (!TP.watchTown(cs)) return 'a watched bench was not re-read after townPollMs';
    await new Promise((r) => setImmediate(r));
    clock += CFG.SESSION_CONFIG.townPollMs;
    if (TP.watchTown(cs)) return 'a second ask went out while one was in flight';
    if (!release) return 'the ask never reached the engine: ' + calls.join(',');
    release();
    for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r));
    if (calls.join(',') !== 'hr_load,accrue:0') return 'the re-read did not ask the settle for the slot: ' + calls.join(',');
    if (cs.read('inventory').shrimp !== 12 || cs.read('inventory').raw_shrimp !== 28) return 'the settle did not replace the bag: ' + JSON.stringify(cs.read('inventory'));
    if (TP.watchTown(cs)) return 'it asked again at once after an answer';
    const run = (k, id, hunt) => TP.townWorkRunning({ active_kind: k, active_id: id }, hunt || null);
    if (run('idle', null) || run('combat', 'wolf')) return 'an idle hero or a fight is re-read as town work';
    if (run('gather', 'normal_tree', { session_id: 'h1', ended: false })) return 'a hunter is re-read as town work (the hunt has its own re-read)';
    if (!run('gather', 'normal_tree', { session_id: 'h1', ended: true }) || !run('artisan', 'cook_shrimp')) return 'a node or a bench after a hunt is not re-read';
    return true;
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
    await new Promise((r) => setImmediate(r));
    const heard = [];
    for (const cs of acc.characters()) cs.subscribe((c, why) => heard.push(c.slot + ':' + why));
    const before = acc.characters().map((cs) => [cs.slot, cs.status, cs._listeners.size]);
    const topics = Array.from(hub.topics.keys()).sort().join();
    const calls = srv.calls.length;
    if (!acc.view(1) || acc.viewed !== 1 || !acc.view(2) || !acc.view(0) || acc.viewed !== 0) return 'view() did not move the pointer';
    if (acc.view(9)) return 'view() moved to a character that is not open';
    await new Promise((r) => setImmediate(r));
    const after = acc.characters().map((cs) => [cs.slot, cs.status, cs._listeners.size]);
    if (after.length !== 3 || after.some((a, i) => a.some((v, j) => v !== before[i][j]))) return 'a switch changed a character (status or listeners)';
    if (Array.from(hub.topics.keys()).sort().join() !== topics) return 'a switch left or joined a topic';
    /* the newly viewed character asks ONE settle (the server's state at once, Part 2 of lane/a-accrue-storm); nothing else is sent */
    const sent = JSON.stringify(srv.calls.slice(calls));
    if (sent !== JSON.stringify([['accrue', { slot: 1 }], ['accrue', { slot: 2 }], ['accrue', { slot: 0 }]])) return 'a switch sent ' + sent + ' (one settle of the newly viewed character each)';
    return heard.every((h) => /^[0-2]:hello$/.test(h)) || 'a switch made characters emit: ' + heard.join(',');
  });
  /* VIEW-3 (perf audit 10-23, Tyler: unviewed sessions off the live view; CLAUDE.md §6 "only the viewed character
     streams live; the others keep playing on the server"). Four heroes of one account in one party hunt, slot 0
     viewed: the viewed session asks at most 5 times a minute, an unviewed one makes at most 1 call a minute and never
     asks the engine (a plain read); a switch asks the newly viewed hero ONE settle and shows the server's state at
     once, and the one left goes quiet; an unviewed hero's hunt end reaches its record (the strip) within a minute.
     All of that with the push channel DOWN (the fallback reads); then with it UP (2026-12-25-frame-push-revive.sql)
     an unviewed hero fed by frames makes no call at all and holds the server's version. */
  await t('VIEW-3', async () => {
    const LAT = 800, MIN = 60000;
    const clock = { t: 0 };
    let tid = 0, lastSettle = -Infinity, pushUp = false;
    const timers = new Map(), late = [], ver = [10, 20, 30, 40], ended = [false, false, false, false];
    const add = (fn, ms, every) => { timers.set(++tid, { fn, at: clock.t + Math.max(0, ms), every }); return tid; };
    const tm = { setTimer: (fn, ms) => add(fn, ms, 0), clearTimer: (i) => timers.delete(i), setInterval: (fn, ms) => add(fn, ms, ms), clearInterval: (i) => timers.delete(i), now: () => clock.t };
    const calls = [[], [], [], []];
    const envOf = (s) => env(ver[s], { account: { max_concurrent: 4 }, hunt: { session_id: 'h' + s, hunt_id: 'mill_cellar', ended: ended[s] } });
    const srv = {
      calls: [],
      rpc: async (name, args) => {
        const s = args && Number.isInteger(args.p_slot) ? args.p_slot : 0;
        calls[s].push({ at: clock.t, name });
        if (name === 'hr_load') return { ok: true, status: 200, body: envOf(s), closed: false };
        return { ok: true, status: 200, body: { ok: true }, closed: false };
      },
      accrue: (b) => {
        const s = b.slot;
        calls[s].push({ at: clock.t, name: 'accrue' });
        return new Promise((resolve) => late.push({ at: clock.t + LAT, run: () => {
          /* one settle moves every member twice (a gap) and pushes each other member its frame: an unviewed one asks nothing for it */
          if (!ended[s] && clock.t - lastSettle >= 15000) { lastSettle = clock.t; for (let k = 0; k < 4; k++) { ver[k] += 2; if (k !== s) gaps.push(k); } }
          resolve({ ok: true, status: 200, body: Object.assign({ accrued: true }, envOf(s)), closed: false });
        } }));
      },
    };
    const auth = { userId: () => UID, token: () => 'jwt', signOut: async () => {} };
    const hub = fakeHub(), gaps = [];
    const acc = new A.AccountSession({ auth, server: srv, tab: memStore(), channel: hub.channel, timers: tm });
    const settle = async () => { for (let k = 0; k < 6; k++) await new Promise((r) => setImmediate(r)); };
    const run = async (untilMs) => {
      for (; clock.t < untilMs; clock.t += 100) {
        await new Promise((r) => setImmediate(r));
        for (let i = 0; i < late.length; i++) if (late[i] && late[i].at <= clock.t) { const l = late[i]; late[i] = null; l.run(); await settle(); }
        while (gaps.length) { const k = gaps.shift(); if (pushUp) { hub.send(C.frameTopic(UID, k), { t: 'state', frame: ver[k], env: envOf(k) }); await settle(); } }
        for (const [i, x] of Array.from(timers)) if (x.at <= clock.t && timers.has(i)) {
          if (x.every) x.at += x.every; else timers.delete(i);
          x.fn(); await settle();
        }
      }
    };
    for (const s of [0, 1, 2, 3]) { const opening = acc.open(s); await run(clock.t + 2000); if (!(await opening).ok) return 'hero ' + s + ' did not open'; }
    if (acc.viewed !== 0) return 'the first hero opened is not the viewed one';
    const inWindow = (s, a, b) => calls[s].filter((x) => x.at >= a && x.at < b);
    /* minutes 1 to 5 of the hunt */
    await run(5 * MIN);
    const viewedRate = inWindow(0, MIN, 5 * MIN).length / 4;
    if (viewedRate > 5) return 'the viewed hero made ' + viewedRate + ' calls a minute (at most 5)';
    for (const s of [1, 2, 3]) {
      const c = inWindow(s, MIN, 5 * MIN);
      if (c.length / 4 > 1) return 'unviewed hero ' + s + ' made ' + c.length / 4 + ' calls a minute (at most 1): ' + c.map((x) => x.name).slice(0, 6).join(',');
      if (c.some((x) => x.name === 'accrue')) return 'unviewed hero ' + s + ' asked the engine (it reads itself with a plain read)';
    }
    /* the switch: ONE settle of the newly viewed hero, its record at the server's version at once; the one left goes quiet */
    const at = clock.t;
    if (!acc.view(2)) return 'view(2) refused';
    await run(at + LAT + 200);
    const asked = inWindow(2, at, at + LAT + 200);
    if (asked.length !== 1 || asked[0].name !== 'accrue') return 'the switch asked ' + JSON.stringify(asked.map((x) => x.name)) + ' of the newly viewed hero (one settle)';
    if (acc.character(2).record.version !== ver[2]) return 'the switched-to hero shows version ' + acc.character(2).record.version + ', the server ' + ver[2];
    if (inWindow(0, at, at + LAT + 200).length || inWindow(1, at, at + LAT + 200).length) return 'the switch asked something of a hero it did not show';
    await run(at + 3 * MIN);
    const left = inWindow(0, at + MIN, at + 3 * MIN);
    if (left.length / 2 > 1 || left.some((x) => x.name === 'accrue')) return 'the hero switched away from kept asking the engine (' + left.length + ' calls in 2 minutes)';
    /* an unviewed hero's hunt ends on the server: its record says so within a minute */
    const endAt = clock.t;
    ended[3] = true; ver[3] += 1;
    await run(endAt + MIN + LAT + 200);
    const h3 = acc.character(3).record.data.hunt;
    if (!(h3 && h3.ended === true)) return 'an unviewed hero\'s hunt end did not reach its record within a minute';
    /* THE PUSH CHANNEL UP: each settle of the viewed hero (2) reaches every other member as a whole frame, so an
       unviewed hero makes NO call while the frames come (its read is deferred, the fallback) and is at the server's version */
    pushUp = true;
    const upAt = clock.t;
    await run(upAt + 3 * MIN);
    for (const s of [0, 1]) {
      const c = inWindow(s, upAt + MIN, upAt + 3 * MIN);
      if (c.length) return 'unviewed hero ' + s + ' fed by frames still made ' + c.length + ' calls in 2 minutes: ' + c.map((x) => x.name).slice(0, 4).join(',');
      if (acc.character(s).record.version !== ver[s]) return 'unviewed hero ' + s + ' fed by frames shows version ' + acc.character(s).record.version + ', the server ' + ver[s];
    }
    return true;
  });
  await t('ACC-2', async () => {
    /* each hero by its server name and its Level from the server's Level XP (21,591 = Level 10, CORE_MODEL.md §2) */
    /* gold is the ACCOUNT purse each hero's answer states, with the wallet version it was read at (goldV) */
    const srv = fakeServer({ 0: env(1, { hero_slots: [0, 2, 3, 99, -1, 'x'], name: 'Tester', state: { gold: 1, gold_v: 4, level_xp: 21591 } }), 2: env(1),
      3: { ok: false, error: 'needs_name', hero_slots: [0, 2, 3] } });
    const acc = mkAccount(srv);
    const r = await acc.roster();
    if (JSON.stringify(r) !== JSON.stringify([{ slot: 0, exists: true, unnamed: false, name: 'Tester', level: 10, gold: 1, goldV: 4 }, { slot: 2, exists: true, unnamed: false, name: null, level: null, gold: 1, goldV: null },
      { slot: 3, exists: false, unnamed: true, name: null, level: null, gold: null, goldV: null }])) return 'roster was ' + JSON.stringify(r);
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
    const none = [offer(null), offer({ slot_id: 2, cost_gold: 0 }), offer({ slot_id: 9, cost_gold: 15000 }), offer({ slot_id: 2, cost_gold: '15000' }), {}];
    for (const extra of none) {
      const acc = mkAccount(fakeServer({ 0: env(1, extra) }));
      await acc.roster();
      if (acc.slotOffer !== null) return 'an offer was read from ' + JSON.stringify(extra) + ': ' + JSON.stringify(acc.slotOffer);
    }
    const srv = fakeServer({ 0: env(1, Object.assign({ hero_slots: [0, 1], name: 'Tester', state: { gold: 80000 } }, offer({ slot_id: 2, cost_gold: 15000 }))),
      1: env(1, { name: 'Fennick', state: { gold: 10 } }) });
    const acc = mkAccount(srv);
    const r = await acc.roster();
    if (JSON.stringify(acc.slotOffer) !== '{"slotId":2,"cost":15000,"max":5}' || r[0].gold !== 80000 || r[1].gold !== 10) return 'the roster read ' + JSON.stringify([acc.slotOffer, r]);
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
    return JSON.stringify(acc.slotOffer) === '{"slotId":3,"cost":40000,"max":5}' || 'after the purchase the offer is ' + JSON.stringify(acc.slotOffer);
  });
  await t('ACC-DEPOT', async () => {
    /* The storage is the ACCOUNT's (2026-11-27-account-depot.sql): what slot 0 puts away is in slot 1's
       storage at once (the account re-reads the other open characters) and after a reload. The fake
       server keeps ONE depot for both slots, as hr_bank_move / hr_state_of do. */
    const depot = {}; const bags = { 0: { rat_tail: 5 }, 1: {} }; let ver = 1;
    const answer = (body) => ({ ok: true, status: 200, body, closed: false });
    const srv = fakeServer({});
    const base = srv.rpc;
    srv.rpc = async (name, args) => {
      if (name === 'hr_load') { srv.calls.push([name, args]); return answer(env(++ver, Object.assign({ name: 'H' + args.p_slot, inventory: { ...bags[args.p_slot] }, bank: { ...depot } }, said(4)))); }
      if (name !== 'hr_bank_move') return base(name, args);
      srv.calls.push([name, args]);
      const [from, to] = args.p_dir === 'deposit' ? [bags[args.p_slot], depot] : [depot, bags[args.p_slot]];
      if (!(from[args.p_item] >= args.p_qty)) return answer({ ok: false, error: 'insufficient_bank' });
      from[args.p_item] -= args.p_qty; if (!from[args.p_item]) delete from[args.p_item];
      to[args.p_item] = (to[args.p_item] || 0) + args.p_qty;
      return answer({ ok: true, version: ++ver });
    };
    const acc = mkAccount(srv);
    await acc.open(0); await acc.open(1);
    const s1 = acc.character(1);
    if (!acc.character(0) || !s1) return 'two characters did not open: ' + acc.characters().map((c) => c.slot);
    const put = await acc.character(0).moveStorage('rat_tail', 3, 'deposit');
    await new Promise((r) => setTimeout(r, 0));
    if (!put.ok) return 'the deposit answered ' + JSON.stringify(put);
    if (JSON.stringify(s1.read('bank')) !== '{"rat_tail":3}') return 'slot 1 still shows storage ' + JSON.stringify(s1.read('bank')) + ' after slot 0 put 3 away (not re-read)';
    const again = mkAccount(srv);
    await again.open(1);
    if (JSON.stringify(again.character(1).read('bank')) !== '{"rat_tail":3}') return 'after a reload slot 1 shows storage ' + JSON.stringify(again.character(1).read('bank'));
    const take = await again.character(1).moveStorage('rat_tail', 3, 'withdraw');
    if (!take.ok || JSON.stringify(again.character(1).read('inventory')) !== '{"rat_tail":3}') return 'slot 1 could not take out what slot 0 put away: ' + JSON.stringify([take, again.character(1).read('inventory')]);
    return true;
  });
  await t('ACC-GOLD', async () => {
    /* GOLD IS THE ACCOUNT'S (Tyler 2026-10-23; 2026-12-15-account-gold.sql): ONE purse, which every hero's
       envelope states at a wallet version (state.gold, state.gold_v). Hero A earns -> hero B, NOT re-read,
       shows the same gold and re-renders; B spends -> A shows it; an older answer never rolls it back. */
    let purse = 500, gv = 3, ver = 1;
    const lag = { 0: null, 1: null };   // a hero whose next answer states an older purse (a raced read)
    const answer = (body) => ({ ok: true, status: 200, body, closed: false });
    const srv = fakeServer({});
    const base = srv.rpc;
    srv.rpc = async (name, args) => {
      if (name !== 'hr_load') return base(name, args);
      srv.calls.push([name, args]);
      const l = lag[args.p_slot];
      return answer(env(++ver, Object.assign({ name: 'H' + args.p_slot, state: l ? { gold: l.gold, gold_v: l.v } : { gold: purse, gold_v: gv } }, said(4))));
    };
    const acc = mkAccount(srv);
    await acc.open(0); await acc.open(1);
    const a = acc.character(0), b = acc.character(1);
    if (!a || !b) return 'two heroes did not open';
    if (I.goldOf(a) !== 500 || I.goldOf(b) !== 500) return 'two heroes of one account read ' + [I.goldOf(a), I.goldOf(b)];
    let painted = 0;
    b.subscribe((s, why) => { if (why === 'purse') painted++; });
    purse = 800; gv = 4; await a.load();   // A earns 300 on its own answer
    if (I.goldOf(b) !== 800 || painted < 1) return 'after hero A earned, hero B shows ' + I.goldOf(b) + ' (re-rendered ' + painted + ' times)';
    purse = 150; gv = 5; await b.load();   // B spends 650 on its own answer
    if (I.goldOf(a) !== 150) return 'after hero B spent, hero A shows ' + I.goldOf(a);
    lag[0] = { gold: 800, v: 4 }; await a.load();   // A's next answer is an OLDER copy
    if (I.goldOf(a) !== 150 || I.goldOf(b) !== 150) return 'an older answer rolled the purse back: ' + [I.goldOf(a), I.goldOf(b)];
    if (I.newerPurse({ gold: 1, v: 5 }, { gold: 2, v: 4 }).gold !== 1 || I.newerPurse({ gold: 1, v: 4 }, { gold: 2, v: 5 }).gold !== 2)
      return 'newerPurse does not keep the higher wallet version';
    return JSON.stringify(acc.purse()) === '{"gold":150,"v":5}' || 'the account purse reads ' + JSON.stringify(acc.purse());
  });
  await t('ACC-FARM', async () => {
    /* The farm land is the ACCOUNT's (2026-12-14-shared-farm.sql): hero 0 plants and hero 1, open
       beside it, sees the plot at once (the account re-reads the other heroes); hero 1 harvests it
       as itself and hero 0 sees it gone. The fake server keeps ONE field for both slots, as
       hr_farm_land_view does. */
    const field = new Map(); let ver = 1;
    const answer = (body) => ({ ok: true, status: 200, body, closed: false });
    const land = () => ({ cap: 2, plot_level: 1, deeds: 0, upgrade: null, plots: Array.from(field.values()) });
    const srv = fakeServer({});
    const base = srv.rpc;
    srv.rpc = async (name, args) => {
      if (name === 'hr_load') { srv.calls.push([name, args]); return answer(env(++ver, Object.assign({ name: 'H' + args.p_slot, farm_land: land() }, said(4)))); }
      if (name === 'hr_farm_plant') {
        srv.calls.push([name, args]);
        if (field.has(args.p_plot_idx)) return answer({ ok: false, error: 'plot_occupied' });
        field.set(args.p_plot_idx, { i: args.p_plot_idx, crop: args.p_crop, ready: true, ready_in_s: 0, waterable: false, regrows_left: null, by: args.p_slot, by_name: 'H' + args.p_slot, extra: false });
        return answer({ ok: true, plot: args.p_plot_idx, crop: args.p_crop });
      }
      if (name === 'hr_farm_harvest') {
        srv.calls.push([name, args]);
        return answer(field.delete(args.p_plot_idx) ? { ok: true, plot: args.p_plot_idx, qty: 2, xp: 672, produce: 'turnip' } : { ok: false, error: 'empty_plot' });
      }
      return base(name, args);
    };
    const acc = mkAccount(srv);
    await acc.open(0); await acc.open(1);
    const s0 = acc.character(0), s1 = acc.character(1);
    if (!s0 || !s1) return 'two heroes did not open: ' + acc.characters().map((c) => c.slot);
    const put = await FI.plantCrop(acc, s0, 0, 'turnip');
    await new Promise((r) => setTimeout(r, 0));
    if (!put.ok) return 'hero 0 could not plant: ' + JSON.stringify(put);
    const seen = FS.farmLandOf(s1, 0);
    const p = seen && seen.plots.get(0);
    if (!p || p.by !== 0 || p.byName !== 'H0') return 'hero 1 does not see the plot hero 0 planted (not re-read): ' + JSON.stringify(s1.read('farm_land'));
    const got = await FI.harvestPlot(acc, s1, 0, false);
    await new Promise((r) => setTimeout(r, 0));
    const sent = srv.calls.filter((c) => c[0] === 'hr_farm_harvest');
    if (!got.ok || sent.length !== 1 || sent[0][1].p_slot !== 1 || sent[0][1].p_plot_idx !== 0) return 'hero 1 did not harvest as itself: ' + JSON.stringify([got, sent]);
    const back = FS.farmLandOf(s0, 0);
    if (!back || back.plots.has(0)) return 'hero 0 still shows the plot hero 1 harvested (not re-read): ' + JSON.stringify(s0.read('farm_land'));
    return true;
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
  ['an engine answer costs a second round trip', 'src/session/character-session.js', "{ if (!(carries && this._take(ans.body, 'load'))) await this.load(); return { ok: true }; }", '{ await this.load(); return { ok: true }; }'],
  ['every intent answer is taken as the envelope', 'src/session/character-session.js', '_settled(await send(), carries === true)', '_settled(await send(), true)'],
  ['merge, not replace', 'src/session/envelope.js', '  const data = {};\n  for (const k of Object.keys(env))', '  const data = Object.assign({}, current ? current.data : {});\n  for (const k of Object.keys(env))'],
  ['stale accepted', 'src/session/envelope.js', "if (current && env.version < current.version) return keep('stale');", ''],
  ['a frame merges into the record', 'src/session/character-session.js', 'return f.env !== null && this._take(f.env, FRAME_EVENT);', 'return f.env !== null && this._take(Object.assign({}, this._record.data, f.env), FRAME_EVENT);'],
  ['a reordered frame is taken', 'src/session/envelope.js', "  if (msg.frame < current.version) return { verdict: 'reorder', env: null };\n", ''],
  ['a frame not stamped with its own version is taken', 'src/session/envelope.js', '    || msg.env.version !== msg.frame || msg.env.ok !== true', '    || msg.env.ok !== true'],
  ['a frame before the first load is taken', 'src/session/envelope.js', "  if (!current) return { verdict: 'not_loaded', env: null };\n", "  if (!current) return { verdict: 'fresh', env: msg.env };\n"],
  ['no state accepted', 'src/session/envelope.js', "if (!isObj(env.state)) return keep('incomplete');", ''],
  ['residue unfiltered', 'src/session/residue.js', '  for (const f of RESIDUE_FIELDS) if (Object.prototype.hasOwnProperty.call(bag, f)) out[f] = sanitizeResidueField(f, bag[f]);', '  Object.assign(out, bag);'],
  ['one topic for every slot', 'src/session/frame-channel.js', "return 'hr:' + uid.toLowerCase() + ':' + slot;", "return 'hr:' + uid.toLowerCase();"],
  ['the slot offer is made up on this side', 'src/session/account-session.js', '    || !Number.isSafeInteger(o.cost_gold) || o.cost_gold < 1) return null;', '    || false) return null;'],
  ['a slot purchase sends a price', 'src/session/account-session.js', "{ p_slot_id: slotId, p_slot: paySlot, p_idem: newIdem() }", "{ p_slot_id: slotId, p_slot: paySlot, p_price: this.slotOffer && this.slotOffer.cost, p_idem: newIdem() }"],
  ['the paying hero keeps its old gold', 'src/session/account-session.js', '      if (cs) await cs.load();\n', ''],
  ['a hero shows its own copy of the account purse', 'src/session/account-session.js', '    cs.accountPurse = () => this._purse;\n', ''],
  ['the purse is the last answer, not the newest version', 'src/session/item-sections.js', '  return b.v > a.v ? b : a;', '  return b;'],
  ['another hero is not re-rendered for a new purse', 'src/session/account-session.js', "if (other !== cs && typeof other.notePurse === 'function') other.notePurse();", 'void other;'],
  ['limit off by one', 'src/session/account-session.js', 'if (this._chars.size >= this.limit()) return', 'if (this._chars.size > this.limit()) return'],
  ['the client ceiling stands in for the server', 'src/session/account-session.js', 'return Math.min(this.config.maxConcurrentCharacters, this._limit === null ? 1 : this._limit);', 'return this.config.maxConcurrentCharacters;'],
  ['the server limit is ignored above one', 'src/session/account-session.js', 'return Math.min(this.config.maxConcurrentCharacters, this._limit === null ? 1 : this._limit);', 'return Math.min(this.config.maxConcurrentCharacters, this._limit === null ? 1 : this.config.maxConcurrentCharacters);'],
  ['a switch re-reads the viewed character', 'src/session/account-session.js', "    this._chars.get(slot).setViewed(true);\n    this._emit('viewed', slot);", "    this._chars.get(slot).setViewed(true);\n    this._chars.get(slot).load();\n    this._emit('viewed', slot);"],
  ['a switch closes the others', 'src/session/account-session.js', "    this._chars.get(slot).setViewed(true);\n    this._emit('viewed', slot);", "    this._chars.get(slot).setViewed(true);\n    for (const c of this._chars.values()) if (c.slot !== slot) c._leave && (c._leave(), c._leave = null);\n    this._emit('viewed', slot);"],
  ['sign-out keeps sb-* keys', 'src/net/auth.js', " || k.startsWith('sb-')", ''],
  ['sign-out keeps the tab id', 'src/net/auth.js', '    if (o.tab) o.tab.remove(cfg.tabKey);\n', ''],
  ['sign-out leaves characters open', 'src/session/account-session.js', '    for (const slot of Array.from(this._chars.keys())) this.close(slot);\n', ''],
  ['existing email told apart', 'src/net/auth.js', "if (error && !/already (registered|exists)/i.test(String(error.message || ''))) return fail(AUTH_COPY.signUpFailed);", 'if (error) return fail(AUTH_COPY.signUpFailed);'],
  ['the engine runs in the players\' region', 'src/session/server.js', "post('/functions/v1/hr-accrue?forceFunctionRegion=' + SUPABASE_CONFIG.functionRegion, body)", "post('/functions/v1/hr-accrue', body)"],
  ['the region is not the database\'s', 'src/net/supabase-bootstrap.js', "functionRegion: 'us-west-2',", "functionRegion: 'us-east-2',"],
  ['closed game ignored', 'src/session/server.js', "return status === CLOSED_STATUS && !!body", "return false && !!body"],
  ['a join sends no hello', 'src/session/character-session.js', "if (st === 'SUBSCRIBED') { this._attempt = 0; if (!this._huntOpen()) this.hello(); return; }", "if (st === 'SUBSCRIBED') { this._attempt = 0; return; }"],
  ['a leave inside the channel callback recurses', 'src/session/character-session.js', "    const leave = this._leave;\n    this._leave = null;\n    if (leave) { try { leave(); } catch (e) { /* already gone */ } }", "    if (this._leave) { try { this._leave(); } catch (e) { /* already gone */ } this._leave = null; }"],
  ['a dropped channel is never re-joined', 'src/session/character-session.js', "this._retry = this._setTimer(() => { this._retry = null; this.connect(); }, reconnectDelay(++this._attempt));", "this._retry = null;"],
  ['a version gap asks the engine', 'src/session/character-session.js', '    return f.env !== null && this._take(f.env, FRAME_EVENT);', '    if (f.env && this._record && f.env.version > this._record.version + 1) this.hello();\n    return f.env !== null && this._take(f.env, FRAME_EVENT);'],
  ['a frame does not defer the re-read', 'src/session/character-session.js', '    if (deferred) this._poll.defer(ms); else this._poll.arm(ms);', '    this._poll.arm(ms);'],
  ['the defer keeps the earlier re-read', 'src/session/hunt-poll.js', '    this.stop();\n    this.arm(ms);', '    this.arm(ms);'],
  ['an open hunt is never re-read', 'src/session/character-session.js', "    this._emit(why);\n    this._armHuntPoll(why === FRAME_EVENT);", "    this._emit(why);"],
  ['a frame does not mark the record whole', 'src/session/character-session.js', 'this._record = r.record; this._wholeAt = r.record.version;', 'this._record = r.record; if (why !== FRAME_EVENT) this._wholeAt = r.record.version;'],
  /* ASK-1 (live 10-23, the accrue storm): the per-frame hello, a join's hello while hunting, the budget, one in flight, the hold */
  ['a join while hunting asks its own hello', 'src/session/character-session.js', "{ this._attempt = 0; if (!this._huntOpen()) this.hello(); return; }", "{ this._attempt = 0; this.hello(); return; }"],
  ['a hello is sent over the budget', 'src/session/character-session.js', "    if (this._pace.waitMs() > 0) { if (!this._huntOpen()) this._pace.owe(() => this.hello()); return Promise.resolve(false); }\n", ''],
  ['an ask spends no budget', 'src/session/ask-pacer.js', '  sent() { this._fill(); this._tokens -= 1; }', '  sent() { this._fill(); }'],
  ['an ask over the budget is dropped, never owed', 'src/session/ask-pacer.js', '    this._owed = this._set(() => { this._owed = null; fn(); }, this.waitMs());', '    void fn;'],
  ['two hellos in flight', 'src/session/character-session.js', '    if (this._asking) { this._again = true; return this._asking; }', ''],
  ['an ask made while one is out is lost', 'src/session/character-session.js', '{ this._again = true; return this._asking; }', '{ return this._asking; }'],
  ['a refusal is asked again at once', 'src/session/character-session.js', '{ this._pace.hold(SESSION_CONFIG.liveRefillMs); if (!this._huntOpen())', '{ if (!this._huntOpen())'],
  ['a refused gap in town is never caught up', 'src/session/character-session.js', 'if (!this._huntOpen()) this._pace.owe(() => this.hello()); }', '}'],
  /* VIEW-3 (perf audit 10-23, Part 2: unviewed sessions off the live view) */
  ['an unviewed hero re-reads at the live pace', 'src/session/character-session.js', 'this._viewed ? pollDelayMs(', 'true ? pollDelayMs('],
  ['an unviewed hero asks the engine', 'src/session/character-session.js', 'const engine = this._viewed || this.leaveAt() !== null;', 'const engine = true;'],
  ['an unviewed hero reads itself every ten minutes', 'src/session/character-session.js', 'Math.min(SESSION_CONFIG.unviewedPollMs, close ?? Infinity)', 'Math.min(10 * SESSION_CONFIG.unviewedPollMs, close ?? Infinity)'],
  ['a switch asks nothing of the newly viewed hero', 'src/session/character-session.js', '    if (this._viewed) this.hello();\n', ''],
  ['a switch never tells the sessions', 'src/session/account-session.js', '    if (was) was.setViewed(false);\n    this._chars.get(slot).setViewed(true);\n', ''],
  /* ASK-2 (perf audit 10-23, the leave-together storm) */
  ['an idle answer at the record\'s version is re-read in full', 'src/session/character-session.js', "    if (Number.isSafeInteger(v) && ans.body.accrued !== true && this._huntOpen() && v <= this._wholeAt) return false;\n", ''],
  ['an idle answer in town is not re-read', 'src/session/character-session.js', '&& this._huntOpen() && v <= this._wholeAt)', '&& v <= this._wholeAt)'],
  ['the close is asked every 2 s past leave_at', 'src/session/hunt-leave.js', 'Math.max(SESSION_CONFIG.leaveRetryMs, Math.ceil(-left))', 'SESSION_CONFIG.leaveRetryMs'],
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
  ['a failed live ask re-arms at once, forever', 'src/session/character-session.js', 'if (!took && engine) this.liveLink.missed();', ''],
  ['the live ask gives up after two tries', 'src/session/live-link.js', '      this.want = true;\n      this._tries++;', '      this.want = this._tries < 2;\n      if (this.want) this._tries++;'],
  ['a storage move leaves the other characters stale', 'src/session/account-session.js', '    for (const [slot, cs] of this._chars) if (slot !== from) cs.load();\n', ''],
  ['a storage move never tells the account', 'src/session/character-session.js', "if (r && r.ok && typeof this.onShared === 'function') this.onShared('bank', this.slot); ", ''],
  ['a farm action never tells the account', 'src/session/farm-intents.js', "    if (typeof cs.onShared === 'function') cs.onShared('farm', cs.slot);\n", ''],
  ['the account ignores a farm change', 'src/session/account-session.js', "const SHARED_KINDS = new Set(['bank', 'farm']);", "const SHARED_KINDS = new Set(['bank']);"],
  ['an idle settle replaces the character','src/session/character-session.js', "if (ans.ok && ans.body && ans.body.accrued !== true) return this.load();", ""],
  ['a watched bench waits until it is done', 'src/session/town-poll.js', "  if (!townAskDue(townWorkRunning(cs.read('state'), cs.read('hunt')), a.busy, a.at, cs.receivedAt, now)) return false;", '  return false;'],
  ['the town re-read asks every display tick', 'src/session/town-poll.js', '  return nowMs - since >= SESSION_CONFIG.townPollMs;', '  return true;'],
  ['two town re-reads in flight', 'src/session/town-poll.js', '  if (!running || busy) return false;', '  if (!running) return false;'],
  ['a hunter is re-read as town work', 'src/session/town-poll.js', "  return !(hunt && typeof hunt === 'object' && typeof hunt.session_id === 'string' && hunt.ended !== true);", '  return true;'],
];

/* The WHOLE src tree at its own layout: the session graph reaches across src/** by relative path
   (the live hunt view, the engine, the data, the net wiring), so a hand-kept list breaks on the
   next new import (trophy-wire-shape, v0.2.32: residue.js -> ../data/homestead-tiers.js). */
function copyTree(dst) {
  cpSync(join(ROOT, 'src'), join(dst, 'src'), { recursive: true, filter: (s) => !/\.(png|webp|jpg|ogg|mp3)$/.test(s) });
}

async function main() {
  const mutate = process.argv.includes('--mutate');
  if (!mutate) {
    const fails = [...await rules(await load(ROOT)), ...await viewRules(ROOT)];
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'session-core: ' + fails.length + ' rule(s) RED' : 'session-core: every session rule holds (39 rules)');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await cleanControl(async () => rules(await load(ROOT)));
  console.log(clean.line);
  if (clean.code) process.exit(clean.code);
  const counts = { caught: 0, harness: 0, escaped: 0 };
  for (const [name, file, from, to] of MUTANTS) {
    const tmp = mkdtempSync(join(tmpdir(), 'hr-session-'));
    try {
      copyTree(tmp);
      const text = readFileSync(join(tmp, file), 'utf8');
      if (!text.includes(from)) { console.log('  ✗ ' + name + ' — HARNESS: anchor not found in ' + file); counts.harness++; continue; }
      writeFileSync(join(tmp, file), text.replace(from, to));
      console.log(report(name, await judge(async () => rules(await load(tmp))), counts));
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(exitOf(counts) ? 'session-core --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)' : 'session-core --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught, each by a named rule');
  process.exit(exitOf(counts));
}
main();
