#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/live-frame-subscribe.mjs — THE PUSH CHANNEL'S CLIENT HALF (M5).
//
//   node tests/live-frame-subscribe.mjs              # the guard
//   node tests/live-frame-subscribe.mjs --list       # the mutation catalogue
//   node tests/live-frame-subscribe.mjs --selftest   # every mutation must be CAUGHT
//   node tests/live-frame-subscribe.mjs --mutate=<id>
//
// Ships with src/net/live.js (transport) and accrue.js `applyFrame` (gate +
// applier). Design: docs/design/LIVE_COUNTERS_PUSH.md §9, WORLD_TICK_DESIGN.md
// §7, SEC_PUSH_CHANNEL_M5_2026-09-23.md (S1-S4, "Before lane/m5-live-subscribe").
//
// ── THE CLAIMS ─────────────────────────────────────────────────────────
//   L1  HAPPY        a fresh frame on the joined topic REPLACES state in G
//                    (gold, skill XP) and raises the floor to the frame.
//   L2  STALE        a reordered or duplicate frame writes NOTHING.
//   L3  ANSWER       the HTTP answer at the version a frame already applied
//                    still lands ONCE with its receipt; a second copy does not.
//   L4  RECONNECT    a channel error retries with backoff, and every
//                    SUBSCRIBED (first and re-join) re-reads once (`hello`).
//   L5  PUSH OFF     with no frames the game is today's: no hello at a boot
//                    join, and the envelope path leaves G byte-identical.
//   L6  STUCK FLOOR  after N consecutive reorders ONE forced hello goes out
//                    through the real requestAccrual (SEC S3), its answer heals
//                    a floor stuck above the server, and the healer is
//                    rate-limited; a heal never borrows an earlier request.
//   L13 HEAL ORDER   (SEC M5-client C1) the floor is KEPT while the heal is
//                    out: a stale frame or HTTP answer arriving between the
//                    heal and its answer writes nothing; an answer is not
//                    allowed below the floor once something fresher landed.
//   L14 COST         (SEC C2) a subscribe→close flap sends at most one hello
//                    per 30 s and backs off; a join that held 30 s resets it.
//   L7  IDENTITY     a frame on a topic that is no longer the player's is
//                    never applied, and the channel is left.
//   L8  BAG ORDER    a frame carrying inventory/bank is refused until the bag
//                    is ABSOLUTE (WORLD_TICK_DESIGN.md §7a), and after that
//                    unless the frame carries inventory_complete===true (F2).
//   L9  SHAPE        a frame with an unknown key / wrong type / bad number is
//                    refused whole.
//   L10 AUTH         setAuth on join AND on every TOKEN_REFRESHED; sign-out
//                    leaves the channel.
//   L11 BOOT         a frame before the session's first settle is not applied
//                    and not counted as a drop.
//   L12 SURFACE      live.js never creates a Realtime client, joins PRIVATE,
//                    and RESIDUE_FIELDS names nothing of this module.
//   ── THE GAP HEAL (2026-10-09-frame-self-echo.sql: no self-frames any more) ──
//   L15 FRAME GAP    a frame that skips a version re-reads the projection and
//                    REPLACES the screen; a contiguous one does not; a re-read
//                    older than a frame that landed meanwhile never rewinds.
//   L16 ★ LOST WRITE (attended) the server commits, the HTTP answer is lost
//                    (throw / 503): the screen catches up in ONE read, now.
//                    FAILS without the heal (mutation lost_write_no_heal).
//   L17 LOST SETTLE  (away) the accrue answer that paid the night is lost:
//                    the screen catches up.
//   L18 POLL GAP     a settle poll above the floor re-reads after a grace,
//                    and not if a frame closed the gap inside it.
//   L19 PUSH OFF     no joined channel → no re-read (today's game).
//   L20 COST         one read in flight, at most one per interval.
//   L21 JITTER       the read is spread 0–2 s (injected; pinned to 0 elsewhere).
//   (L16 also covers SEC change A: a 2xx with a truncated body / no envelope.)
//
// Mutations patch COPIES of accrue.js/live.js written to the OS temp dir (never
// the tree), with their imports re-pointed at the real files, and re-run every
// claim against them. Credential-free, database-free, no browser.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const NET = new URL('src/net/', ROOT);

const MUTATIONS = {
  frame_not_applied: { kills: ['L1'], file: 'live',
    why: 'the router drops every frame on the floor',
    from: '  const written = applyFrame(G, payload);', to: '  const written = null;' },
  stale_frame_applied: { kills: ['L2'], file: 'accrue',
    why: 'applyFrame writes a reorder/duplicate',
    from: "  if (gate.verdict !== 'fresh') return refuse(", to: "  if (gate.verdict === 'unversioned') return refuse(" },
  answer_dropped: { kills: ['L3'], file: 'accrue',
    why: 'the answer behind a frame classifies duplicate, so its receipt is lost',
    from: '  if (v === floor && floor === lastAppliedFrame && v === frameHeldAt) {', to: '  if (false) {' },
  answer_twice: { kills: ['L3'], file: 'accrue',
    why: 'the held frame is never claimed, so a second copy of the answer re-hangs the receipt',
    from: '    frameHeldAt = null;     // the answer owed', to: '    // the answer owed' },
  no_retry: { kills: ['L4'], file: 'live',
    why: 'a channel error is never retried',
    from: "  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') scheduleRetry();", to: '' },
  no_hello_on_join: { kills: ['L4'], file: 'live',
    why: 'a (re)join does not re-read, so the gap stays open',
    from: '    armGap();\n    joinHello();', to: '    armGap();' },
  hello_at_boot: { kills: ['L5'], file: 'live',
    why: 'the boot join sends its own hello on top of the boot settle',
    from: "  if (bootSettlePending() && !settleInFlight()) return 'boot';", to: '' },
  no_heal: { kills: ['L6'], file: 'live',
    why: 'the stuck-floor healer re-reads with a plain hello, whose answer the stuck floor refuses',
    from: '  try { const p = e.heal(token);', to: '  try { const p = e.hello();' },
  heal_opens_floor: { kills: ['L13'], file: 'accrue',
    why: 'THE OLD HEAL (SEC C1): the floor opens before the answer, so a stale frame/answer in flight lands as fresh',
    from: '  floorHeal = { token: floorHealSeq, floor: lastAppliedFrame };',
    to: '  lastAppliedFrame = -1; clearFrameDrops(); floorHeal = { token: floorHealSeq, floor: lastAppliedFrame };' },
  heal_trusts_any_answer: { kills: ['L13'], file: 'accrue',
    why: 'any answer arriving during a heal may lower the floor, not only the heal\'s own',
    from: "healTagged.get(res) : undefined;", to: "(floorHeal ? floorHeal.token : undefined) : undefined;" },
  heal_answer_coerces: { kills: ['L13'], file: 'accrue',
    why: 'SEC C3: the heal answer coerces its version, so version:null reads as frame 0 and drops the floor',
    from: 'const v = body.ok === true ? frameVersion(body.version) : NaN;',
    to: 'const v = body.ok === true ? Number(body.version) : NaN;' },
  heal_after_fresher: { kills: ['L13'], file: 'accrue',
    why: 'the heal answer lowers the floor even after something fresher landed',
    from: ' && lastAppliedFrame === floorHeal.floor;', to: ';' },
  heal_borrows_inflight: { kills: ['L6'], file: 'accrue',
    why: 'the heal borrows the answer to a request sent before it began, and never asks itself',
    from: '  if (inFlight && o.heal != null) return', to: '  if (false) return' },
  attempt_reset_on_join: { kills: ['L14'], file: 'live',
    why: 'SEC C2: every SUBSCRIBED resets the backoff, so a flap retries at the base delay forever',
    from: '    st.joinedAt = env().now();', to: '    st.attempt = 0; st.joinedAt = env().now();' },
  hello_uncapped: { kills: ['L14'], file: 'live',
    why: 'SEC C2: every join sends a hello, so a flap spends ~1 Edge call a second',
    from: '  if (wait <= 0) { hello(); return; }', to: '  { hello(); return; }' },
  bag_without_complete: { kills: ['L8'], file: 'accrue',
    why: 'SEC F2: a bag frame without inventory_complete lands and takes the merge-upward path',
    from: "    if (env.inventory_complete !== true) return refuse('bag_incomplete', true);", to: '' },
  heal_unlimited: { kills: ['L6'], file: 'live',
    why: 'the healer is not rate-limited',
    from: '  if (st.lastHealAt && now - st.lastHealAt < LIVE_HEAL_MIN_INTERVAL_MS) return false;', to: '' },
  topic_unchecked: { kills: ['L7'], file: 'live',
    why: "a frame is applied whatever character is in G now",
    from: "  if (topic !== st.topic || topic !== liveTopic(id.uid, id.slot)) { leave('identity'); ensureLive(); return; }", to: '' },
  bag_before_flip: { kills: ['L8'], file: 'accrue',
    why: 'an inventory frame lands on a merging bag',
    from: "    if (!isInventoryAbsolute()) return refuse('premature', true);", to: '' },
  unknown_key_ok: { kills: ['L9'], file: 'accrue',
    why: 'a frame with an unknown key is applied',
    from: "  if (!keys.length || keys.some((k) => FRAME_KEYS.indexOf(k) === -1)) return null;", to: '' },
  no_setauth_refresh: { kills: ['L10'], file: 'live',
    why: 'a refreshed token never reaches Realtime, so the private channel stops authorizing',
    from: "      if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')", to: "      if ((event === 'NEVER')" },
  /* ── THE GAP HEAL (2026-10-09-frame-self-echo.sql) ── */
  lost_write_no_heal: { kills: ['L16', 'L20'], file: 'accrue',
    why: 'THE REGRESSION: a write whose answer was lost never re-reads, and no self-frame comes any more',
    from: "    requestGapHeal('lost:' + (verb || 'write'));\n    throw err;", to: '    throw err;' },
  lost_5xx_no_heal: { kills: ['L16'], file: 'accrue',
    why: 'a write answered 5xx (maybe committed) never re-reads',
    from: "  if (res && typeof res.status === 'number' && res.status >= 500) requestGapHeal(", to: '  if (false) requestGapHeal(' },
  accrue_lost_no_heal: { kills: ['L17'], file: 'accrue',
    why: 'an away settle whose answer was lost never re-reads, so the paid night is invisible',
    from: "      requestGapHeal('accrue:' + out.outcome);", to: '' },
  poll_gap_ignored: { kills: ['L18'], file: 'accrue',
    why: 'a settle poll that says the server is ahead of the floor is ignored',
    from: "        requestGapHeal('poll_gap', { atLeast: v, delayMs: GAP_HEAL_GRACE_MS });", to: '' },
  poll_gap_no_grace: { kills: ['L18'], file: 'accrue',
    why: 'the poll gap re-reads at once, racing the frame already in flight',
    from: "{ atLeast: v, delayMs: GAP_HEAL_GRACE_MS }", to: '{ atLeast: v }' },
  frame_gap_ignored: { kills: ['L15'], file: 'live',
    why: 'a frame that skips a version is applied and nothing re-reads what the skipped version changed',
    from: "  if (written.gap) { st.gaps += 1; requestGapHeal('frame_gap'); }", to: '' },
  heal_2xx_unread: { kills: ['L16'], file: 'accrue',
    why: 'SEC change A: a committed write answered 2xx with a truncated body / no envelope never re-reads',
    from: "  if (res && typeof res.status === 'number' && res.status >= 200 && res.status < 300",
    to: "  if (false && res && typeof res.status === 'number' && res.status >= 200 && res.status < 300" },
  heal_no_jitter: { kills: ['L21'], file: 'accrue',
    why: 'every tab heals at the same instant after a blip',
    from: '    Number.isFinite(o.delayMs) ? o.delayMs : 0, jitter);', to: '    Number.isFinite(o.delayMs) ? o.delayMs : 0);' },
  heal_rewinds: { kills: ['L15'], file: 'accrue',
    why: 'a re-read older than a frame that landed meanwhile is applied (a rewind)',
    from: "  if (gate.verdict !== 'fresh' && gate.verdict !== 'answer') return refuse(gate.verdict);",
    to: "  if (gate.verdict === 'unversioned') return refuse(gate.verdict);" },
  heal_reads_but_keeps: { kills: ['L15', 'L16', 'L17', 'L18'], file: 'accrue',
    why: 'the re-read arrives and nothing REPLACES the screen with it',
    from: '      const written = applyHealProjection(G, v.body);', to: '      const written = null;' },
  gap_heal_never_disarmed: { kills: ['L19'], file: 'live',
    why: 'leaving the channel leaves the gap heal armed (push off is no longer today)',
    from: "  armGapHeal(null);\n  if (why === 'identity'", to: "  if (why === 'identity'" },
  gap_heal_unlimited: { kills: ['L20'], file: 'accrue',
    why: 'every lost write is its own re-read: a flaky network becomes a read storm',
    from: '  const wait = Math.max(gapHeal.lastAt ? gapHeal.lastAt + GAP_HEAL_MIN_INTERVAL_MS - now : 0,',
    to: '  const wait = Math.max(0,' },
  frames_at_boot: { kills: ['L11'], file: 'accrue',
    why: 'frames apply before the boot settle, racing the away receipt',
    from: "  if (!awaySettleClosed || isReconcilePending()) return refuse('booting', false);", to: '' },
};

const problems = [];
const ok = (cond, claim, msg) => { if (!cond) problems.push(claim + ': ' + msg); };

/* Copies in the temp dir with every relative import re-pointed at the tree. */
async function loadMutant(id) {
  const m = MUTATIONS[id];
  const dir = await mkdtemp(join(tmpdir(), 'hr-live-'));
  const abs = (src) => src.replace(/(from\s+|import\s*\()(['"])(\.{1,2}\/[^'"]+)\2/g,
    (all, pre, q, rel) => pre + q + new URL(rel, NET).href + q);
  let acc = await readFile(new URL('accrue.js', NET), 'utf8');
  let live = await readFile(new URL('live.js', NET), 'utf8');
  if (m.file === 'accrue') { if (!acc.includes(m.from)) return { stale: true, dir }; acc = acc.replace(m.from, m.to); }
  if (m.file === 'live') { if (!live.includes(m.from)) return { stale: true, dir }; live = live.replace(m.from, m.to); }
  const accPath = join(dir, 'accrue.mjs');
  await writeFile(accPath, abs(acc));
  live = live.replace(/(['"])\.\/accrue\.js\?v=\d+\1/, JSON.stringify(pathToFileURL(accPath).href));
  const livePath = join(dir, 'live.mjs');
  await writeFile(livePath, abs(live));
  return { A: await import(pathToFileURL(accPath).href), L: await import(pathToFileURL(livePath).href), dir };
}

async function loadReal() {
  const live = await readFile(new URL('live.js', NET), 'utf8');
  const q = (live.match(/\.\/accrue\.js(\?v=\d+)/) || [])[1] || '';
  return { A: await import(new URL('accrue.js' + q, NET).href), L: await import(new URL('live.js' + q, NET).href) };
}

const UID = '0b5e7c1a-1111-4222-8333-944455556666';
const UID2 = '0b5e7c1a-1111-4222-8333-000000000002';
const state = (gold) => ({ slot: 0, gold, gems: 0, hp: 40, max_hp: 40, accrued_to: '2026-10-05T12:00:00Z' });
const frameAt = (v, gold, extra) => ({ t: 'delta', frame: v,
  patch: { state: state(gold), skills: { mining: { xp: gold * 2, level: 1 } }, buffs: [], place: null, ...(extra || {}) } });
/* An hr_load body (record.js heal mode): the whole projection, no away receipt. */
const projAt = (v, gold, bag) => ({ ok: true, version: v, now: '2026-10-05T12:00:00Z',
  state: state(gold), skills: { mining: { xp: gold * 2 } }, inventory: { ...(bag || {}) }, equipment: {}, bank: {} });
const envAt = (v, gold) => ({ ok: true, accrued: true, version: v, now: '2026-10-05T12:00:00Z',
  state: state(gold), skills: { mining: { xp: gold * 2 } }, inventory: { copper_ore: 1 },
  equipment: {}, bank: {}, away: { ms: 600000, kind: 'gather', credited: true, gold: 3 } });

function fakeClient() {
  const c = { channels: [], removed: 0, setAuth: [], authCb: null, created: 0 };
  c.realtime = { setAuth: (t) => { c.setAuth.push(t); return Promise.resolve(); } };
  c.auth = { onAuthStateChange: (cb) => { c.authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; } };
  c.channel = (topic, opts) => {
    const ch = { topic, opts, handlers: [], statusCb: null,
      on(type, filter, cb) { this.handlers.push({ type, filter, cb }); return this; },
      subscribe(cb) { this.statusCb = cb; return this; } };
    c.channels.push(ch);
    return ch;
  };
  c.removeChannel = () => { c.removed += 1; return Promise.resolve('ok'); };
  c.last = () => c.channels[c.channels.length - 1];
  c.status = (s) => { const ch = c.last(); if (ch && ch.statusCb) ch.statusCb(s); };
  c.emit = (payload, ch) => { const x = ch || c.last();
    for (const h of x.handlers) if (h.type === 'broadcast' && h.filter.event === 'frame') h.cb({ type: 'broadcast', event: 'frame', payload }); };
  return c;
}

/* A rig: fake client, manual timers, a hello that records (and may apply). */
function rig(A, L, opts) {
  const o = opts || {};
  const c = fakeClient();
  const G = { gold: 0, gems: 0, skills: {}, inventory: {} };
  const timers = [];
  const id = { uid: UID, token: 't1', slot: 0 };
  const r = { c, G, timers, id, hellos: 0, applied: 0, reads: 0, clock: 1e9 };
  L.__resetLive();
  A.resetFrameGate();
  A.__resetAwaySettleLatch(o.booting ? false : true);
  L.setLiveEnv({
    client: () => c,
    identity: () => ({ ...id }),
    G: () => G,
    hello: () => { r.hellos += 1; if (o.onHello) o.onHello(G); return Promise.resolve(); },
    /* The gap heal's read (record.js hr_load, heal mode): the SERVER's projection
       as the test has it at the moment of the read. */
    gapJitterMs: () => (o.jitter == null ? 0 : o.jitter),
    reread: () => { r.reads += 1; return Promise.resolve(r.server ? { outcome: 'loaded', body: r.server() } : null); },
    applied: () => { r.applied += 1; },
    now: () => r.clock,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {},
  });
  r.fire = () => { const t = timers.shift(); if (t) t.fn(); return t; };
  return r;
}

const settleIo = async () => { for (let i = 0; i < 6; i++) await new Promise((res) => setImmediate(res)); };

/* The REAL requestAccrual over a held fetch: each hr-accrue call queues until
   the test answers it, so the order of arrival is the test's to choose. */
function http(A, G) {
  const q = [];
  const prev = globalThis.fetch;
  globalThis.fetch = (url) => {
    if (String(url).includes('/rest/v1/')) return Promise.resolve({ ok: false, status: 404, json: async () => [] });
    return new Promise((resolve) => q.push((body) => resolve({ ok: true, status: 200, json: async () => body })));
  };
  A.configureAccrual({ url: 'https://example.invalid', authToken: 'tok' });
  A.setAccrualHooks({ onApplied: (b) => A.applyEnvelope(G, b) });
  return {
    q,
    answer: async (body) => { const f = q.shift(); if (f) f(body); await settleIo(); return !!f; },
    restore: async () => {
      while (q.length) { q.shift()({ ok: true, accrued: false, reason: 'idle', version: 0 }); await settleIo(); }
      globalThis.fetch = prev; A.configureAccrual(null); A.setAccrualHooks({ onApplied: null });
    },
  };
}

export async function liveFrameGuard(mutation) {
  problems.length = 0;
  let mods; let dir = null;
  if (mutation) {
    if (!MUTATIONS[mutation]) { problems.push('unknown mutation ' + mutation); return problems; }
    mods = await loadMutant(mutation);
    dir = mods.dir;
    if (mods.stale) {
      problems.push('MUTATION ' + mutation + ' did not apply — its anchor is gone. The guard is stale.');
      await rm(dir, { recursive: true, force: true });
      return problems;
    }
  } else {
    mods = await loadReal();
  }
  const { A, L } = mods;
  const topic = 'hr:' + UID + ':0';
  try {
    // ── L1 HAPPY ──────────────────────────────────────────────────────────
    {
      const r = rig(A, L);
      L.ensureLive();
      ok(r.c.channels.length === 1 && r.c.last().topic === topic, 'L1',
        'did not join exactly the own topic (joined ' + r.c.channels.map((x) => x.topic).join(',') + ')');
      r.c.status('SUBSCRIBED');
      r.c.emit(frameAt(10, 120));
      ok(r.G.gold === 120 && r.G.skills.mining === 240, 'L1',
        'a fresh frame did not replace G (gold ' + r.G.gold + ', mining ' + r.G.skills.mining + ')');
      ok(A.getAppliedFrame() === 10 && r.applied === 1, 'L1',
        'floor ' + A.getAppliedFrame() + ', repaint hook ' + r.applied + ' — the frame was not committed/painted');
      r.c.emit(frameAt(11, 130));
      ok(r.G.gold === 130 && A.getAppliedFrame() === 11, 'L1', 'the next frame did not tick the counter up');
    }

    // ── L2 STALE ──────────────────────────────────────────────────────────
    {
      const r = rig(A, L);
      L.ensureLive(); r.c.status('SUBSCRIBED');
      r.c.emit(frameAt(20, 200));
      r.c.emit(frameAt(19, 1));
      ok(r.G.gold === 200 && r.G.skills.mining === 400, 'L2', 'a REORDERED frame (19 < 20) wrote G: gold ' + r.G.gold);
      r.G.gold = 200;
      r.c.emit(frameAt(20, 7));
      ok(r.G.gold === 200, 'L2', 'a DUPLICATE frame (20) wrote G: gold ' + r.G.gold);
      ok(A.getAppliedFrame() === 20, 'L2', 'a stale frame moved the floor to ' + A.getAppliedFrame());
    }

    // ── L3 THE ANSWER BEHIND A FRAME ────────────────────────────────────────
    {
      const r = rig(A, L);
      L.ensureLive(); r.c.status('SUBSCRIBED');
      r.c.emit(frameAt(30, 300));                        // the frame wins the race
      const first = A.applyEnvelope(r.G, envAt(30, 300)); // …then the HTTP answer
      ok(!!first && !!first.paidReceipt, 'L3',
        'the HTTP answer at the version a frame already applied was dropped, so its away receipt '
        + 'never reached the player (the frame carries none).');
      const again = A.applyEnvelope(r.G, envAt(30, 300));
      ok(again === null, 'L3', 'a SECOND copy of the answer applied — its receipt would be hung twice.');
      ok(A.getAppliedFrame() === 30, 'L3', 'the answer moved the floor to ' + A.getAppliedFrame());
    }

    // ── L4 RECONNECT ────────────────────────────────────────────────────────
    {
      const r = rig(A, L);
      L.ensureLive(); r.c.status('SUBSCRIBED');
      ok(r.hellos === 1, 'L4', 'the first join did not re-read (hellos ' + r.hellos + ')');
      r.c.status('CHANNEL_ERROR');
      ok(r.timers.length === 1 && r.c.removed >= 1, 'L4',
        'a channel error scheduled ' + r.timers.length + ' retry(ies) and removed ' + r.c.removed + ' channel(s)');
      const d1 = r.timers[0] && r.timers[0].ms;
      r.fire();
      ok(r.c.channels.length === 2, 'L4', 'the retry did not re-join (channels ' + r.c.channels.length + ')');
      r.c.status('TIMED_OUT');
      const d2 = r.timers[0] && r.timers[0].ms;
      ok(d1 > 0 && d2 > d1 * 1.1, 'L4', 'the retry delay did not back off (' + d1 + ' → ' + d2 + ')');
      r.fire();
      r.clock += L.LIVE_HELLO_MIN_INTERVAL_MS;
      r.c.status('SUBSCRIBED');
      ok(r.hellos === 2, 'L4', 'the RE-join did not re-read hr_state_of (hellos ' + r.hellos + ')');
      r.clock += L.LIVE_STABLE_JOIN_MS;
      r.c.status('CLOSED');
      const d3 = r.timers[r.timers.length - 1] && r.timers[r.timers.length - 1].ms;
      ok(d3 > 0 && d3 <= 1200, 'L4', 'a join that held ' + L.LIVE_STABLE_JOIN_MS + ' ms did not reset the backoff (next delay ' + d3 + ')');
    }

    // ── L5 PUSH OFF = TODAY ─────────────────────────────────────────────────
    {
      const prevFetch = globalThis.fetch;
      globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
      try {
        const r = rig(A, L, { booting: true });
        A.configureAccrual({ url: 'https://example.invalid', authToken: 'tok' });
        L.ensureLive(); r.c.status('SUBSCRIBED');
        ok(r.hellos === 0, 'L5', 'a BOOT join sent its own hello on top of the boot settle (' + r.hellos + ').');
        A.configureAccrual(null);
        A.__resetAwaySettleLatch(true);
        /* Wall-clock stamps (`at`, `…At`) differ between two runs by construction. */
        const norm = (g) => JSON.stringify(g, (k, v) => (/(^at$|At$)/.test(k) ? 0 : v));
        const G0 = { gold: 0, gems: 0, skills: {}, inventory: {} };
        A.resetFrameGate(); A.applyEnvelope(G0, envAt(40, 9)); A.applyEnvelope(G0, envAt(41, 11));
        A.resetFrameGate(); A.applyEnvelope(r.G, envAt(40, 9)); A.applyEnvelope(r.G, envAt(41, 11));
        ok(norm(r.G) === norm(G0), 'L5', 'with the channel joined and no frames, the envelope path wrote a '
          + 'different G:\n' + norm(r.G).slice(0, 300) + '\n' + norm(G0).slice(0, 300));
        ok(L.getLiveState().applied === 0 && r.applied === 0, 'L5', 'something was applied with no frame sent.');
      } finally { globalThis.fetch = prevFetch; A.configureAccrual(null); }
    }

    // ── L6 STUCK FLOOR ──────────────────────────────────────────────────────
    {
      const r = rig(A, L);
      const h = http(A, r.G);
      try {
        L.ensureLive(); r.c.status('SUBSCRIBED');
        A.commitFrame(1e6);                               // the stuck floor
        const heals0 = L.getLiveState().heals;
        for (let v = 895; v < 895 + L.LIVE_HEAL_AFTER_DROPS; v++) r.c.emit(frameAt(v, 1));
        await settleIo();
        ok(L.getLiveState().heals === heals0 + 1 && h.q.length === 1, 'L6',
          'after ' + L.LIVE_HEAL_AFTER_DROPS + ' reorders the healer sent ' + h.q.length + ' request(s) (heals +'
          + (L.getLiveState().heals - heals0) + '), not ONE forced hello.');
        await h.answer(envAt(900, 77));
        ok(A.getAppliedFrame() === 900 && r.G.gold === 77, 'L6',
          'the heal answer did not heal the stuck floor: floor ' + A.getAppliedFrame() + ', gold ' + r.G.gold + '.');
        A.commitFrame(2e6);
        for (let v = 0; v < 5; v++) r.c.emit(frameAt(901 + v, 1));
        await settleIo();
        ok(L.getLiveState().heals === heals0 + 1 && h.q.length === 0, 'L6', 'the healer fired again inside its rate limit');
        r.clock += L.LIVE_HEAL_MIN_INTERVAL_MS + 1;
        r.c.emit(frameAt(950, 1));
        await settleIo();
        ok(h.q.length === 1, 'L6', 'the healer never fires again after its rate limit');
        const g = r.G.gold;
        await h.answer({ ok: true, accrued: false, reason: 'idle', version: 1500, now: '2026-10-05T12:00:00Z' });
        ok(A.getAppliedFrame() === 1500 && r.G.gold === g, 'L6',
          'an idle (not-accrued) heal answer did not set the floor to the server\'s version 1500 (floor '
          + A.getAppliedFrame() + ', gold ' + r.G.gold + ').');

        /* A heal raised while another settle is in flight waits for it and asks
           ITSELF — the in-flight answer predates the heal and is never trusted. */
        A.resetFrameGate(); L.__resetLive(); L.ensureLive(); r.c.status('SUBSCRIBED');
        A.commitFrame(1e6);
        const early = A.requestAccrual({ force: true });  // in flight BEFORE the heal
        await settleIo();
        for (let v = 895; v < 895 + L.LIVE_HEAL_AFTER_DROPS; v++) r.c.emit(frameAt(v, 1));
        await h.answer(envAt(800, 8));                    // the earlier request's (stale) answer
        await early;
        await settleIo();
        ok(A.getAppliedFrame() === 1e6 && r.G.gold !== 8, 'L6',
          'the answer to a request sent BEFORE the heal lowered the floor (floor ' + A.getAppliedFrame() + ').');
        ok(h.q.length === 1, 'L6', 'the heal borrowed the in-flight answer and never asked itself ('
          + h.q.length + ' request(s) queued after it).');
        await h.answer(envAt(900, 90));
        ok(A.getAppliedFrame() === 900 && r.G.gold === 90, 'L6',
          'the heal\'s own answer, sent after the in-flight one, did not heal (floor ' + A.getAppliedFrame() + ').');
      } finally { await h.restore(); }
    }

    // ── L7 IDENTITY ─────────────────────────────────────────────────────────
    {
      const r = rig(A, L);
      L.ensureLive(); r.c.status('SUBSCRIBED');
      const old = r.c.last();
      r.id.uid = UID2;                                  // the character in G changed
      r.c.emit(frameAt(50, 999), old);
      ok(r.G.gold === 0, 'L7', "a frame on the PREVIOUS character's topic was applied (gold " + r.G.gold + ').');
      ok(r.c.removed >= 1 && L.getLiveState().topic === 'hr:' + UID2 + ':0', 'L7',
        'the old topic was not left / the new one not joined (topic ' + L.getLiveState().topic + ')');
    }

    // ── L8 BAG ORDER ────────────────────────────────────────────────────────
    {
      const r = rig(A, L);
      L.ensureLive(); r.c.status('SUBSCRIBED');
      r.G.inventory = { copper_ore: 3 };
      r.c.emit(frameAt(60, 5, { inventory: { copper_ore: 9 }, inventory_complete: true }));
      ok(r.G.inventory.copper_ore === 3 && r.G.gold === 0, 'L8',
        'an inventory frame landed on a MERGING bag (copper ' + r.G.inventory.copper_ore + ').');
      const prevD = globalThis.DUNGEONS;
      globalThis.DUNGEONS = {};
      try {
        A.markEquipAuthorityLive(true);
        A.noteServerArmPermission(true);
        A.noteBaselineComplete({ inventory_complete: true });
        let armed = false;
        try { A.markInventoryAuthorityLive(true); armed = A.isInventoryAbsolute(); } catch (e) { armed = false; }
        if (armed) {
          r.c.emit(frameAt(61, 5, { inventory: { copper_ore: 9 } }));
          ok(r.G.gold === 0 && r.G.inventory.copper_ore === 3, 'L8',
            'an ABSOLUTE-time bag frame WITHOUT inventory_complete===true landed (copper '
            + r.G.inventory.copper_ore + ') — it would take the merge-upward path (SEC F2).');
          r.c.emit(frameAt(62, 6, { inventory: { copper_ore: 9 }, inventory_complete: true }));
          ok(r.G.gold === 6 && r.G.inventory.copper_ore === 9, 'L8',
            'after the ABSOLUTE flip a complete inventory frame did not land in the bag (copper '
            + r.G.inventory.copper_ore + ', gold ' + r.G.gold + ').');
        } else {
          problems.push('L8: could not arm the absolute bag in node, so the post-flip half did not run.');
        }
      } finally {
        try { A.markInventoryAuthorityLive(false); } catch (e) {}
        A.markEquipAuthorityLive(false);
        A.__resetAutoArm(); A.__resetServerArmPermission();
        if (prevD === undefined) delete globalThis.DUNGEONS; else globalThis.DUNGEONS = prevD;
      }
    }

    // ── L9 SHAPE ────────────────────────────────────────────────────────────
    {
      const r = rig(A, L);
      L.ensureLive(); r.c.status('SUBSCRIBED');
      const bad = [
        { t: 'delta', frame: 70, patch: { state: state(70), gold_override: 1 } },
        { t: 'envelope', frame: 71, patch: { state: state(71) } },
        { t: 'delta', frame: '72', patch: { state: state(72) } },
        { t: 'delta', frame: 73.5, patch: { state: state(73) } },
        { t: 'delta', frame: 74, patch: [] },
        { t: 'delta', frame: 75, patch: { state: [] } },
        null,
      ];
      for (const b of bad) r.c.emit(b);
      ok(r.G.gold === 0 && A.getAppliedFrame() === -1, 'L9',
        'a malformed frame was applied (gold ' + r.G.gold + ', floor ' + A.getAppliedFrame() + ').');
    }

    // ── L10 AUTH ────────────────────────────────────────────────────────────
    {
      const r = rig(A, L);
      L.ensureLive();
      ok(r.c.setAuth[0] === 't1', 'L10', 'the join did not setAuth the session token first');
      r.c.status('SUBSCRIBED');
      r.c.authCb && r.c.authCb('TOKEN_REFRESHED', { access_token: 't2' });
      ok(r.c.setAuth.includes('t2'), 'L10', 'a refreshed token was not handed to Realtime (setAuth ' + r.c.setAuth.join(',') + ')');
      r.id.token = null;
      r.c.authCb && r.c.authCb('SIGNED_OUT', null);
      ok(L.getLiveState().topic === null && r.c.removed >= 1, 'L10', 'sign-out did not leave the channel');
    }

    // ── L11 BOOT ────────────────────────────────────────────────────────────
    {
      const r = rig(A, L, { booting: true });
      L.ensureLive(); r.c.status('SUBSCRIBED');
      r.c.emit(frameAt(80, 80));
      ok(r.G.gold === 0, 'L11', 'a frame applied before the boot settle closed (gold ' + r.G.gold + ').');
      ok(A.getFrameDrops().drops === 0, 'L11', 'a pre-boot frame was counted as a drop.');
    }

    // ── L13 HEAL ORDER (SEC M5-client C1) ─────────────────────────────────
    {
      /* (a) THE SECURITY REPRO. Floor 20/gold 200; frames 17,18,19 are a
         legitimate reorder and fire the heal. A late frame 16 and a stale HTTP
         answer at 15 arrive BEFORE the heal's answer: neither may write G. */
      const r = rig(A, L);
      const h = http(A, r.G);
      try {
        L.ensureLive(); r.c.status('SUBSCRIBED');
        r.c.emit(frameAt(20, 200));
        for (const v of [17, 18, 19]) r.c.emit(frameAt(v, 1000 + v));
        await settleIo();
        ok(L.getLiveState().heals === 1 && h.q.length === 1, 'L13', 'precondition: the reorders did not fire the heal');
        ok(A.getAppliedFrame() === 20, 'L13', 'the heal OPENED the floor before its answer (floor ' + A.getAppliedFrame() + ').');
        r.c.emit(frameAt(16, 1016));
        ok(r.G.gold === 200 && A.getAppliedFrame() === 20, 'L13',
          'a stale frame 16 arriving between the heal and its answer wrote G (gold ' + r.G.gold
          + ', floor ' + A.getAppliedFrame() + ') — the SEC C1 rollback.');
        A.applyEnvelope(r.G, envAt(15, 946));
        ok(r.G.gold === 200 && A.getAppliedFrame() === 20, 'L13',
          'a stale HTTP answer (15) arriving between the heal and its answer wrote G (gold ' + r.G.gold + ').');
        await h.answer(envAt(22, 220));
        ok(r.G.gold === 220 && A.getAppliedFrame() === 22, 'L13',
          'the heal\'s own answer (22, truth) did not land (gold ' + r.G.gold + ', floor ' + A.getAppliedFrame() + ').');
        r.c.emit(frameAt(16, 1016));
        ok(r.G.gold === 220, 'L13', 'a stale frame after the heal answer wrote G (gold ' + r.G.gold + ').');
      } finally { await h.restore(); }
    }
    {
      /* (b) SOMETHING FRESHER LANDED while the heal was out: the gate proved it
         is not stuck, so the heal's lower answer may not take the floor down. */
      const r = rig(A, L);
      const h = http(A, r.G);
      try {
        L.ensureLive(); r.c.status('SUBSCRIBED');
        r.c.emit(frameAt(1000, 100));
        for (const v of [997, 998, 999]) r.c.emit(frameAt(v, 1));
        await settleIo();
        ok(h.q.length === 1, 'L13', 'precondition (b): no heal in flight');
        r.c.emit(frameAt(1001, 101));
        await h.answer(envAt(950, 5));
        ok(r.G.gold === 101 && A.getAppliedFrame() === 1001, 'L13',
          'a heal answer BELOW a floor that something fresher had raised was applied (gold ' + r.G.gold
          + ', floor ' + A.getAppliedFrame() + ').');
      } finally { await h.restore(); }
    }
    {
      /* (c) HTTP ONLY (frame_push=false): the watchdog heal on reordered answers
         keeps the floor, so a late answer at 46 cannot roll gold back. */
      const r = rig(A, L);
      const h = http(A, r.G);
      try {
        L.ensureLive(); r.c.status('SUBSCRIBED');
        A.applyEnvelope(r.G, envAt(50, 500));
        for (const v of [47, 48, 49]) A.applyEnvelope(r.G, envAt(v, 900 + v));
        const healed = L.healStuckFloor();
        await settleIo();
        ok(healed === true && h.q.length === 1, 'L13', 'precondition (c): the watchdog heal did not fire');
        A.applyEnvelope(r.G, envAt(46, 946));
        ok(r.G.gold === 500 && A.getAppliedFrame() === 50, 'L13',
          'HTTP only: a late answer (46) after the watchdog heal wrote G (gold ' + r.G.gold + ', truth 500).');
        await h.answer({ ok: true, accrued: false, reason: 'idle', version: 50 });
        ok(A.getAppliedFrame() === 50 && r.G.gold === 500, 'L13', 'the idle heal answer at the floor moved it to ' + A.getAppliedFrame());
      } finally { await h.restore(); }
    }
    for (const bad of [null, '4', NaN, undefined, -3]) {
      /* (d) SEC C3 (repro R8): an ok:true idle heal answer whose version is not
         a finite non-negative NUMBER closes the heal and KEEPS the floor —
         `Number(null)` is 0 and `Number('4')` is 4, neither is the server's word. */
      const r = rig(A, L);
      const h = http(A, r.G);
      try {
        L.ensureLive(); r.c.status('SUBSCRIBED');
        A.applyEnvelope(r.G, envAt(20, 200));
        for (const v of [17, 18, 19]) A.applyEnvelope(r.G, envAt(v, 900 + v));
        const healed = L.healStuckFloor();
        await settleIo();
        ok(healed === true && h.q.length === 1, 'L13', 'precondition (d ' + String(bad) + '): the watchdog heal did not fire');
        await h.answer({ ok: true, accrued: false, reason: 'idle', version: bad });
        ok(A.getAppliedFrame() === 20 && r.G.gold === 200, 'L13',
          'an idle heal answer with version ' + JSON.stringify(String(bad)) + ' (' + typeof bad + ') moved the floor 20 → '
          + A.getAppliedFrame() + ' (SEC C3).');
        ok(A.getFloorHeal() === null, 'L13', 'an idle heal answer with version ' + String(bad) + ' left the heal open.');
      } finally { await h.restore(); }
    }

    // ── L15 FRAME GAP (2026-10-09-frame-self-echo.sql) ──────────────────────
    //    The player's own write at 101 pushes NO frame (the HTTP answer was
    //    meant to carry it, and was lost); the tick's 102 does, partially.
    {
      const r = rig(A, L);
      L.ensureLive(); r.c.status('SUBSCRIBED');
      r.c.emit(frameAt(100, 10));
      r.server = () => projAt(102, 60, { copper_ore: 5 });
      r.c.emit(frameAt(102, 60));
      await settleIo();
      ok(r.reads === 1, 'L15', 'a frame that SKIPPED a version (100 → 102) did not re-read the projection '
        + '(reads ' + r.reads + '). Whatever 101 changed outside frame_keys stays wrong on screen.');
      ok(r.G.inventory.copper_ore === 5 && r.G.gold === 60 && A.getAppliedFrame() === 102, 'L15',
        'the re-read did not REPLACE the screen with the server\'s 102 (copper ' + r.G.inventory.copper_ore
        + ', gold ' + r.G.gold + ', floor ' + A.getAppliedFrame() + ').');
      r.c.emit(frameAt(103, 61));
      await settleIo();
      ok(r.reads === 1, 'L15', 'a CONTIGUOUS frame (102 → 103) re-read the projection (reads ' + r.reads + ').');
      /* A read that comes back OLDER than a frame that landed while it was out
         never rewinds, and asks once more (the frame is partial). */
      r.clock += A.GAP_HEAL_MIN_INTERVAL_MS + 1;
      let raced = false;   // the first read races frame 106; any later read is the server at 106
      r.server = () => {
        if (raced) return projAt(106, 66, { copper_ore: 5 });
        raced = true; r.c.emit(frameAt(106, 66)); return projAt(105, 55, { copper_ore: 1 });
      };
      r.c.emit(frameAt(105, 65));
      await settleIo();
      ok(r.G.gold === 66 && A.getAppliedFrame() === 106 && r.G.inventory.copper_ore === 5, 'L15',
        'a re-read OLDER than a frame that landed meanwhile rewound the screen (gold ' + r.G.gold + ', floor '
        + A.getAppliedFrame() + ', copper ' + r.G.inventory.copper_ore + ').');
      ok(A.getGapHealState().stale === 1 && r.timers.length === 1, 'L15',
        'the stale re-read did not ask once more, rate-limited (stale ' + A.getGapHealState().stale
        + ', timers ' + r.timers.length + ').');
    }

    // ── L16 ★ LOST WRITE, ATTENDED: the regression the self-echo makes real ──
    //    The server COMMITS the player's write (v201: gold 20 → 15) and the HTTP
    //    response is dropped. No self-frame follows any more. The screen must
    //    catch up to the server within the heal (one read, now).
    for (const shape of ['throw', '503', 'truncated', 'no_envelope']) {
      const r = rig(A, L);
      L.ensureLive(); r.c.status('SUBSCRIBED');
      r.c.emit(frameAt(200, 20));
      r.server = () => projAt(201, 15, { bread: 2 });
      const prev = globalThis.fetch;
      /* SEC change A: a 2xx after the commit whose body is TRUNCATED (the JSON
         read throws) or carries NO versioned envelope is just as lost. */
      globalThis.fetch = {
        throw: () => Promise.reject(new TypeError('Failed to fetch')),
        503: () => Promise.resolve({ ok: false, status: 503, json: async () => ({ ok: false, error: 'engine_unavailable' }) }),
        truncated: () => Promise.resolve({ ok: true, status: 200,
          json: async () => JSON.parse('{"ok":true,"accrued":true,"version":201,"sta') }),
        no_envelope: () => Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) }),
      }[shape];
      let threw = false;
      try {
        const res = await A.fetchWrite('https://example.invalid/functions/v1/hr-accrue', { method: 'POST' }, 'eat');
        try { await res.json(); } catch (e) { if (shape !== 'truncated') throw e; }   // the caller's own body read
      } catch (e) { threw = true; }
      finally { globalThis.fetch = prev; }
      await settleIo();
      ok(threw === (shape === 'throw'), 'L16', 'fetchWrite changed what the caller sees (' + shape + ', threw ' + threw + ').');
      ok(r.reads === 1 && r.G.gold === 15 && r.G.inventory.bread === 2 && A.getAppliedFrame() === 201, 'L16',
        'after a write whose answer was lost (' + shape + ') the screen did NOT catch up to the server: gold '
        + r.G.gold + ' (server 15), bread ' + r.G.inventory.bread + ', floor ' + A.getAppliedFrame()
        + ', reads ' + r.reads + '. The browser says one thing and the server another (CLAUDE.md §6).');
    }

    // ── L17 ★ LOST SETTLE, AWAY: the accrue answer that paid the night is lost ─
    {
      const r = rig(A, L);
      L.ensureLive(); r.c.status('SUBSCRIBED');
      r.c.emit(frameAt(300, 30));
      r.server = () => projAt(301, 90, { copper_ore: 12 });
      const prev = globalThis.fetch;
      globalThis.fetch = (url) => (String(url).includes('/rest/v1/')
        ? Promise.resolve({ ok: false, status: 404, json: async () => [] })
        : Promise.reject(new TypeError('network changed')));
      A.configureAccrual({ url: 'https://example.invalid', authToken: 'tok' });
      try { await A.requestAccrual({ force: true }); }
      finally { globalThis.fetch = prev; A.configureAccrual(null); A.resetAccrualGate(); }
      await settleIo();
      ok(r.reads === 1 && r.G.gold === 90 && r.G.inventory.copper_ore === 12, 'L17',
        'an away settle whose answer was lost left the screen behind the server (gold ' + r.G.gold
        + ' vs 90, copper ' + r.G.inventory.copper_ore + ' vs 12, reads ' + r.reads + ').');
    }

    // ── L18 POLL GAP: the settle poll states a version above the floor ───────
    {
      const r = rig(A, L);
      const h = http(A, r.G);
      try {
        L.ensureLive(); r.c.status('SUBSCRIBED');
        r.c.emit(frameAt(400, 40));
        r.server = () => projAt(402, 70, {});
        const p = A.requestAccrual({ force: true });
        await settleIo();
        await h.answer({ ok: true, accrued: false, reason: 'idle', version: 402, now: '2026-10-05T12:00:00Z' });
        await p; await settleIo();
        const t = r.timers.find((x) => x.ms === A.GAP_HEAL_GRACE_MS);
        ok(r.reads === 0 && !!t, 'L18', 'a poll answer above the floor did not wait its grace before re-reading '
          + '(reads ' + r.reads + ', timers ' + r.timers.map((x) => x.ms).join(',') + ').');
        while (r.timers.length) r.fire();
        await settleIo();
        ok(r.reads === 1 && r.G.gold === 70 && A.getAppliedFrame() === 402, 'L18',
          'a poll that said the server is at 402 while the screen was at 400 did not heal (gold ' + r.G.gold
          + ', floor ' + A.getAppliedFrame() + ', reads ' + r.reads + ').');
        /* …and a frame that closes the gap inside the grace cancels the read. */
        r.clock += A.GAP_HEAL_MIN_INTERVAL_MS + 1;
        const p2 = A.requestAccrual({ force: true });
        await settleIo();
        await h.answer({ ok: true, accrued: false, reason: 'idle', version: 403, now: '2026-10-05T12:00:00Z' });
        await p2; await settleIo();
        r.c.emit(frameAt(403, 71));
        while (r.timers.length) r.fire();
        await settleIo();
        ok(r.reads === 1, 'L18', 'a poll gap that a frame closed inside the grace still re-read (reads ' + r.reads + ').');
      } finally { await h.restore(); A.resetAccrualGate(); }
    }

    // ── L21 JITTER: a lost write's read is spread over 0–2 s, never a burst ──
    {
      const r = rig(A, L, { jitter: 1234 });
      L.ensureLive(); r.c.status('SUBSCRIBED');
      r.c.emit(frameAt(700, 1));
      r.server = () => projAt(701, 9, {});
      const prev = globalThis.fetch;
      globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
      try { await A.fetchWrite('https://example.invalid/functions/v1/hr-accrue', { method: 'POST' }, 'eat'); } catch (e) {}
      finally { globalThis.fetch = prev; }
      await settleIo();
      ok(r.reads === 0 && r.timers.length === 1 && r.timers[0].ms === 1234, 'L21',
        'the heal read was not deferred by its jitter (reads ' + r.reads + ', timers ' + r.timers.map((x) => x.ms).join(',') + ').');
      r.fire(); await settleIo();
      ok(r.reads === 1 && r.G.gold === 9, 'L21', 'the jittered read never went out / never healed (gold ' + r.G.gold + ').');
    }

    // ── L19 PUSH OFF = TODAY: no channel, no gap heal ───────────────────────
    {
      const r = rig(A, L);
      r.server = () => projAt(501, 1, {});
      A.commitFrame(500);
      const prev = globalThis.fetch;
      globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
      try { await A.fetchWrite('https://example.invalid/functions/v1/hr-accrue', { method: 'POST' }, 'eat'); } catch (e) {}
      finally { globalThis.fetch = prev; }
      await settleIo();
      ok(r.reads === 0 && A.requestGapHeal('probe') === 'unarmed', 'L19',
        'with NO joined channel a lost write still re-read (reads ' + r.reads + '): push off must be today\'s game.');
      L.ensureLive(); r.c.status('SUBSCRIBED');
      r.id.token = null;
      r.c.authCb && r.c.authCb('SIGNED_OUT', null);
      ok(A.requestGapHeal('probe') === 'unarmed', 'L19', 'leaving the channel did not disarm the gap heal.');
    }

    // ── L20 COST: one read in flight, at most one per interval ──────────────
    {
      const r = rig(A, L);
      L.ensureLive(); r.c.status('SUBSCRIBED');
      r.c.emit(frameAt(600, 1));
      let v = 600;
      r.server = () => projAt(++v, 2, {});
      const prev = globalThis.fetch;
      globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
      try {
        for (let i = 0; i < 20; i++) {
          try { await A.fetchWrite('https://example.invalid/functions/v1/hr-accrue', { method: 'POST' }, 'eat'); } catch (e) {}
        }
      } finally { globalThis.fetch = prev; }
      await settleIo();
      ok(r.reads === 1 && r.timers.length === 1, 'L20', '20 lost writes inside one interval sent ' + r.reads
        + ' read(s) and armed ' + r.timers.length + ' timer(s) — expected 1 now and 1 deferred.');
      r.fire();
      await settleIo();
      ok(r.reads === 2 && r.timers.length === 0, 'L20', 'the deferred read did not go out exactly once (reads ' + r.reads + ').');
    }

    // ── L14 COST (SEC C2) ───────────────────────────────────────────────────
    {
      const r = rig(A, L);
      L.ensureLive();
      const t0 = r.clock;
      let lastDelay = 0;
      for (let i = 0; i < 30; i++) {
        r.c.status('SUBSCRIBED');
        r.clock += 1000;
        r.c.status('CLOSED');
        lastDelay = r.timers.length ? r.timers[r.timers.length - 1].ms : 0;
        while (r.timers.length) r.fire();
      }
      const window = Math.ceil((r.clock - t0) / L.LIVE_HELLO_MIN_INTERVAL_MS) + 1;
      ok(r.hellos <= window, 'L14', 'a subscribe→close flap over ' + ((r.clock - t0) / 1000) + ' s sent '
        + r.hellos + ' hellos (cap ' + window + ', one per ' + L.LIVE_HELLO_MIN_INTERVAL_MS + ' ms).');
      ok(lastDelay >= L.LIVE_BACKOFF_MAX_MS * 0.8, 'L14',
        'after 30 flaps the retry delay is ' + lastDelay + ' ms — the backoff resets on every SUBSCRIBED.');
      /* A deferred hello still goes out once the window passes, if still joined. */
      const r2 = rig(A, L);
      L.ensureLive(); r2.c.status('SUBSCRIBED');
      r2.c.status('CLOSED'); r2.fire();
      r2.clock += 1000;
      r2.c.status('SUBSCRIBED');
      ok(r2.hellos === 1 && r2.timers.length === 1, 'L14', 'a join inside the hello window did not defer its hello');
      r2.fire();
      ok(r2.hellos === 2, 'L14', 'the deferred hello never went out, so the join gap stays open');
    }

    // ── L12 SURFACE (source) ────────────────────────────────────────────────
    if (!mutation) {
      const live = await readFile(new URL('live.js', NET), 'utf8');
      const code = live.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      ok(!/createClient\s*\(/.test(code), 'L12', 'live.js creates a Supabase client — one client, one connection.');
      ok(/private:\s*true/.test(code), 'L12', 'live.js does not join its topic as PRIVATE.');
      const cs = await readFile(new URL('client-state.js', NET), 'utf8');
      const m = cs.match(/export const RESIDUE_FIELDS = Object\.freeze\(\[([\s\S]*?)\]\)/);
      const body = m ? m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '') : '';
      const fields = (body.match(/'([^']+)'/g) || []).join(' ');
      ok(!!m && !/frame|live/i.test(fields), 'L12', 'RESIDUE_FIELDS names a frame/live field: ' + fields);
    }
  } finally {
    try { L.setLiveEnv(null); L.__resetLive(); A.resetFrameGate(); } catch (e) {}
    if (dir) await rm(dir, { recursive: true, force: true });
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const one = (argv.find((a) => a.startsWith('--mutate=')) || '').split('=')[1] || null;
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log('  ' + id.padEnd(20) + ' kills ' + m.kills.join(',') + ' — ' + m.why);
    process.exit(0);
  }
  if (argv.includes('--selftest')) {
    const clean = await liveFrameGuard(null);
    if (clean.length) {
      console.error('  ✗ SELFTEST FLOOR: the clean run is red, so no mutation can be scored:');
      for (const p of clean) console.error('      ' + p);
      process.exit(1);
    }
    console.log('  floor: the clean run is green — mutations can be scored.');
    let bad = 0;
    for (const [id, m] of Object.entries(MUTATIONS)) {
      const found = await liveFrameGuard(id);
      const caught = m.kills.filter((k) => found.some((f) => f.startsWith(k + ':')));
      if (caught.length !== m.kills.length) {
        bad++;
        console.error('  ✗ ' + id + ' was NOT caught by ' + m.kills.filter((k) => !caught.includes(k)).join(',')
          + ' (findings: ' + (found.join(' | ') || 'none') + ')');
      } else console.log('  ✓ ' + id + ' caught by ' + caught.join(','));
    }
    if (bad) { console.error('live-frame-subscribe --selftest: ' + bad + ' mutation(s) uncaught'); process.exit(1); }
    console.log('live-frame-subscribe --selftest: all ' + Object.keys(MUTATIONS).length + ' mutations caught, on top of a green clean run.');
    process.exit(0);
  }
  const found = await liveFrameGuard(one);
  if (found.length) { for (const p of found) console.error('  ✗ ' + p); process.exit(1); }
  console.log('live-frame-subscribe: OK — own private topic, gated frames replace state, answers keep '
    + 'their receipt, reconnect re-reads, stuck floor heals, push-off is today.');
}
