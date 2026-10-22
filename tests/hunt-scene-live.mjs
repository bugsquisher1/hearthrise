#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-scene-live.mjs — THE LIVE HUNT ON SCREEN (option B, Tyler 2026-10-19).
//
//   node tests/hunt-scene-live.mjs            the rules (node + headless Chrome)
//   node tests/hunt-scene-live.mjs --node     the node rules only
//   node tests/hunt-scene-live.mjs --mutate   every planted defect must turn its rule RED
//
// mutant-anchors: src/session/character-session.js src/session/hunt-poll.js src/session/live-link.js src/session/config.js src/session/hunt-sections.js src/shell/widgets/vitals-hub.js src/shell/widgets/party-panel.js src/session/character-sections.js src/hunt-view/scene.js src/hunt-view/timeline.js src/hunt-view/live-engine.js
// mutant-writes-tree: no — mutants are planted into a temp copy of src/
//
// The REAL CharacterSession, timeline, live engine and scene over a scripted
// server whose answers are the edge's own (hunt-settle.js huntLive, the shipped
// engine on the shipped Mill Cellar ground; tests/hunt-live.mjs proves the
// browser's swings equal the server's). tests/fixtures/hunt-envelope-live.json is
// hr_state_of for the QA character read from production (15:39:57 UTC 10-19).
//
//   LV-0  A READ ALONE DRAWS THE POSE: hr_load only (no live start point yet) draws the
//         viewed hero and the pose's monsters (the v0.2.7 empty cellar).
//   LV-1  FROM ENTER: the hero is drawn within 1 s, walking, with the travel line
//         ("Walking to Mill Cellar · N s"), for the whole server travel time.
//   LV-2  LIVE: the instant the engine starts, the browser runs it: the hero moves within
//         1 s, every frame draws it, no frame moves it half a tile, no frame plays a
//         burst of events, and the playback is a hair behind real time (liveDelayMs).
//   LV-5  every monster drawn has a sprite (never a stub box), and each bar is the HP
//         at the instant shown (never a grey empty bar).
//   LV-6  A PARTY: both heroes of a two-member instance are drawn for the whole run.
//   LV-3  REGEN IN REAL UNITS: +HP/s and +mana/s at the engine's in-fight rates.
//   LV-14 A SETUP CHANGED MID-HUNT, VIEWED (r10, Andy): settings sent while the hunt runs reach
//         the server's next settle (its hero unit carries them), and the browser restarts its
//         prediction with them within a second of the answer, so no later commit diverges
//         (the browser-closed half: tests/hunt-live.mjs LV-S, tests/hunt-sessions-settle.mjs SETTINGS).
//   LV-15 EVERY HP READOUT IS THE BAR'S: the vitals hub and the party panel read the HP the timeline
//         plays now (hunt-sections.js liveHpOf), never the last commit's (Andy 10-21, "appeared green").
//   LV-15b the same for a hunting party-mate's row in the party panel (LV-15 reads only your own).
//   LV-18 SWITCHED AWAY AND BACK MID-HUNT (Andy 10-21): the pane is remounted, the scene is the
//         character's (liveSceneOf): a monster drawn dead is never drawn standing again, no corpse
//         replays its fall or turns.
//   LV-19 A UNIT DIES ONCE (a second kill never restarts the fall) AND LIES THE WAY IT FELL.
//   LV-20 EVERY PARTY MEMBER WEARS ITS OUTFIT: your other hero its session's server `outfit`, another
//         player's hero the party section's member `outfit` (2026-11-04-party-outfits.sql), never the role's.
//   LV-4  THE PAGE (headless Chrome, the real client, the same server answers): the hunt
//         draws, no page error, and the frame loop holds budget against the frozen sim
//         (prototypes/hunt-sim) measured the same way.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HARNESS as LIVE_H } from './hunt-live.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const LIVE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/hunt-envelope-live.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const BUDGET = Object.freeze({ speedSlack: 1.05, frameStepTiles: 0.1, lagMs: 2100, maxStepTiles: 0.5, maxEventSpreadMs: 100, gapMedianMs: 25, simBusyFactor: 1.25, simBusySlackMs: 2 });
const TRAVEL_MS = 20000;   // the server's travel time to Mill Cellar (hr_hunt_travel), as the session states it

async function load(base) {
  const u = (p) => import(pathToFileURL(join(base, p)).href + V);
  return {
    C: await u('src/session/character-session.js'),
    CFG: await u('src/session/config.js'),
    HSX: await u('src/session/hunt-sections.js'),
    HUB: await u('src/shell/widgets/vitals-hub.js'),
    PP: await u('src/shell/widgets/party-panel.js'),
    S: await u('src/hunt-view/scene.js'),
    TL: await u('src/hunt-view/timeline.js'),
    B: await u('src/world/core/book.js'),
    SETS: await u('src/data/world/atlas-sets.js'),
    ROLES: await u('src/data/hunt-roles.js'),
    GRID: await u('src/core/hunt/grid.js'),
    HG: await u('src/core/hunt-ground.js'),
    base,
  };
}

function bookOf(M) {
  const manifests = {};
  for (const set of M.SETS.ATLAS_SETS) manifests[set] = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  return M.B.createBook(manifests);
}

/* The character's envelope for a hunt entered at `enteredMs` (its first boundary `fromMs`), its party listing `heroes`. */
function envFor(nowMs, enteredMs, heroes, fromMs) {
  const e = clone(LIVE);
  e.now = new Date(nowMs).toISOString();
  e.hunt.pose = null;
  e.hunt.hero.unit = null;
  e.hunt.session.entered_at = new Date(enteredMs).toISOString();
  e.hunt.session.hunt_from = new Date(fromMs ?? enteredMs + TRAVEL_MS).toISOString();
  e.party.members = heroes.map((h, i) => Object.assign(clone(LIVE.party.members[0]), { seat: i, unit: h.unit, name: h.name, weapon: h.weapon }));
  e.party.self = heroes[0].unit; e.party.leader = heroes[0].unit; e.party.max = heroes.length;
  return e;
}

/* A watched run: Enter at T0 - travelMs (default TRAVEL_MS), the instance's first boundary at T0; the
   server answers the polls as the edge does (hunt-settle.js: not_due with no start point until the
   first boundary, a start point below the floor, a commit with its check past it). `opt`:
     travelMs    how long before the first boundary Enter was pressed
     viewer      whose start point the session is sent (the viewed member; default the first)
     otherFirst  another member's client settles the instance as soon as the floor allows, so this
                 session's polls only ever get start points (live v0.2.20: the leader's tab froze)
     latencyMs   every hr-accrue answer lands this long after the ask (live: 0.7-1.0 s)
     seedless    (n) => true: the n-th hr-accrue answer brings no start point and no commit (a
                 refused or replayed settle: about half the answers on live v0.2.21)
     rpc         (name, args) => answer: an intent answered by the test (LV-14), else a read
     hold        [from, to] server ms: no poll answers (the network is gone)
     pause       [from, to] server ms: the frame loop stops (a background tab)
     switchAt    [from, to] server ms: another character is viewed. Its World pane is unmounted (no frame,
                 no engine step; the polls go on) and mounted again at `to`: the scene is the one each
                 mount takes from scene.js liveSceneOf, as src/world/world-boot.js does
     people      the party_people section (seat -> user, slot); peers: the account's other sessions
     outfits     { seat: outfit }: the party section's member `outfit` ({ id, colors }) by seat */
async function playLive(M, LM, book, mis, spanMs, onFrame, opt) {
  const o = opt || {};
  const T0 = LIVE_H.T0;
  const srv = LIVE_H.server(LM, mis);
  const OFF = 3000000;
  const entered = T0 - (o.travelMs ?? TRAVEL_MS);
  const viewer = o.viewer || mis[0].user;
  const clock = { t: entered - OFF };
  const heroes = () => mis.map((m, i) => ({ unit: m.unitId ?? (i === 0 ? null : null), name: 'Hero ' + (i + 1), weapon: 'sword' }));
  let version = LIVE.version, lastCommit = T0;
  const windows = new WeakSet();
  const env = () => {
    const e = Object.assign(envFor(clock.t + OFF, entered, heroes(), T0), { version: ++version }, o.people ? { party_people: clone(o.people) } : null);
    for (const m of e.party.members) if (o.outfits && o.outfits[m.seat]) m.outfit = clone(o.outfits[m.seat]);
    return e;
  };
  const late = [];
  const wait = (body) => (o.latencyMs ? new Promise((r) => late.push({ at: clock.t + o.latencyMs, r, body })) : body);
  const server = {
    /* `rpc` (name, args) => answer or undefined: an intent the test answers itself (LV-14), else a read */
    rpc: async (name, args) => (o.rpc && o.rpc(name, args)) || { ok: true, body: env() },
    accrue: async () => { const n = asked++; return wait(o.seedless && o.seedless(n) ? { ok: true, body: Object.assign(env(), { accrued: false, settled: false, reason: 'replayed' }) } : answer()); },
  };
  let asked = 0;
  const answer = () => {
    {
      const s = clock.t + OFF;
      if (s <= srv.inst.settled_to_ms) return { ok: true, body: Object.assign(env(), { accrued: false, settled: false, reason: 'not_due' }) };
      if (s >= T0 && s - lastCommit >= 15000) {
        const c = srv.commit(s);
        lastCommit = s;
        if (c) { windows.add(c.tl.hunt_track); return { ok: true, body: Object.assign(env(), { accrued: true, settled: true, hunt_check: c.check }, c.tl) }; }
      }
      return { ok: true, body: Object.assign(env(), { accrued: false, settled: false, reason: 'below_min_span', hunt_live: clone(srv.live(viewer)) }) };
    }
  };
  const timers = [];
  const cs = new M.C.CharacterSession({ slot: 0, uid: '11111111-2222-3333-4444-555555555555', server,
    setTimer: (fn, ms) => { timers.push({ fn, at: clock.t + ms }); return timers.length; }, clearTimer: () => {}, now: () => clock.t });
  await cs.load();
  /* ONE POSITION SOURCE: a server window played into the timeline while a prediction exists (running,
     or out of seeds and waiting for its restart) is a second source writing the prediction's units. */
  const ingest = cs.timeline.ingest;
  /* NOTHING PLAYED LATE: a batch whose steps lie more than two swings behind the server's clock is the
     past drawn at once (a restart from an older commit fed swing by swing: the jump catchUp eases). */
  const sources = { foreign: 0, past: 0 };
  cs.timeline.ingest = (b, t) => {
    if (b && windows.has(b.track) && (cs.live.running() || cs.live.stalled())) sources.foreign++;
    const now = cs.timeline.serverNowAt(t);
    if (b && Array.isArray(b.track) && now !== null && b.track.some((st) => st.atMs < now - 2 * LM.CB.tickMs)) sources.past++;
    return ingest(b, t);
  };
  const mount = () => M.S.liveSceneOf(cs, { key: 'mill_cellar|live', book, peers: o.peers });
  let scene = o.switchAt ? mount() : M.S.createHuntScene({ timeline: cs.timeline, book, read: () => M.S.readHunt(cs, o.peers) });
  const played = [];
  cs.timeline.subscribe((ev) => { played.push(ev.atMs); if (!o.switchAt) scene.onEvent(ev, cs.now()); });
  let away = false;
  for (let s = entered; s < T0 + spanMs; s += 1000 / 60) {
    clock.t = s - OFF;
    if (o.otherFirst && s > T0 && s - lastCommit >= 15000) { srv.commit(s); lastCommit = s; }
    /* `hold` [from, to] (server ms): the network is gone; no poll answers until it returns */
    const held = o.hold && s >= o.hold[0] && s < o.hold[1];
    for (let i = 0; i < late.length; i++) if (late[i] && late[i].at <= clock.t) { const l = late[i]; late[i] = null; l.r(l.body); for (let k = 0; k < 4; k++) await new Promise((r) => setImmediate(r)); }
    for (let i = 0; i < timers.length && !held; i++) {
      if (timers[i] && timers[i].at <= clock.t) { const t = timers[i]; timers[i] = null; t.fn(); await new Promise((r) => setImmediate(r)); }
    }
    /* an intent the test sent (`rpc`) is answered and re-read on the frame it lands, as a browser would */
    if (o.rpc) for (let k = 0; k < 4; k++) await new Promise((r) => setImmediate(r));
    /* `pause` [from, to] (server ms): the frame loop stops (a background tab: no frame, no engine step) */
    if (o.pause && s >= o.pause[0] && s < o.pause[1]) continue;
    if (o.switchAt && s >= o.switchAt[0] && s < o.switchAt[1]) { away = true; continue; }
    if (away) { away = false; scene = mount(); }   // viewed again: a new pane, the character's scene
    cs.liveAdvance(clock.t);
    const back = cs.takeReseeded(); if (back) scene.revive(back, clock.t);
    played.length = 0;
    cs.timeline.advance(clock.t);
    onFrame({ s, f: scene.frame(clock.t), cs, played, T0, entered, mis, sources, srv });
  }
  return cs;
}

async function nodeRules(M) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push(id + ': ' + msg); };
  const book = bookOf(M);
  const LM = await LIVE_H.load(ROOT);

  { // LV-0
    const clock = { t: 50000 };
    const server = { rpc: async () => ({ ok: true, body: clone(LIVE) }), accrue: async () => ({ ok: true, body: { ok: true, accrued: false } }) };
    const cs = new M.C.CharacterSession({ slot: 0, uid: '11111111-2222-3333-4444-555555555555', server, setTimer: () => 0, clearTimer: () => {}, now: () => clock.t });
    await cs.load();
    const scene = M.S.createHuntScene({ timeline: cs.timeline, book, read: () => M.S.readHunt(cs) });
    clock.t += 1000; cs.timeline.advance(clock.t);
    const f = scene.frame(clock.t);
    const heroPose = LIVE.hunt.pose.units.find((u) => u.side === 'hero');
    const mons = LIVE.hunt.pose.units.filter((u) => u.side === 'monster');
    ok('LV-0', f.hero && Math.round(f.hero.x) === heroPose.x && Math.round(f.hero.y) === heroPose.y, `after hr_load alone the hero is not at its pose tile (${JSON.stringify(f.hero && [f.hero.x, f.hero.y])})`);
    ok('LV-0', mons.every((p) => f.units.some((d) => d.unit === p.u)), `the pose's monsters are not drawn (${f.units.length} of ${mons.length})`);
  }

  { // LV-1, LV-2, LV-5
    const delay = M.CFG.SESSION_CONFIG.liveDelayMs;
    let firstDrawn = null, firstWalk = null, travelPlate = 0, travelFrames = 0, firstMove = null, prev = null, maxStep = 0, maxSpeed = 0, maxBurst = 0, empty = 0, frames = 0;
    const kinds = new Set(); let bars = 0, badBars = 0, unnamed = 0, liveDelay = null;
    const warn = console.warn; console.warn = () => { unnamed++; };
    try {
      await playLive(M, LM, book, [LIVE_H.memberOf(LM, 'a', 0, 'tank', 6)], 120000, ({ s, f, cs, played, T0, entered }) => {
        const h = f.hero;
        if (h && firstDrawn === null) firstDrawn = s - entered;
        if (s < T0 - 200) {
          travelFrames++;
          if (h && h.anim === 'walk' && firstWalk === null) firstWalk = s - entered;
          if (h && h.plate && /^Walking to Mill Cellar · \d+ s$/.test(h.plate.text)) travelPlate++;
          return;
        }
        if (s < T0) return;
        if (liveDelay === null && cs.live.running()) liveDelay = cs.timeline.delayMs();
        if (!h) { empty++; return; }
        frames++;
        if (prev && h.unit === prev.unit) {
          const st = Math.hypot(h.x - prev.x, h.y - prev.y);
          maxStep = Math.max(maxStep, st);
          maxSpeed = Math.max(maxSpeed, st * 60);   // tiles per second (frames 1/60 s apart)
          if (st > 1e-6 && firstMove === null) firstMove = s - T0;
        }
        prev = h;
        const spread = played.length ? Math.max(...played) - Math.min(...played) : 0;
        maxBurst = Math.max(maxBurst, spread);
        for (const d of f.units) {
          kinds.add(d.id);
          if (d.bar !== undefined && d.bar !== null) {
            bars++;
            const hp = cs.timeline.hpAt(d.unit, cs.now());
            if (!hp || !(d.bar > 0) || Math.abs(d.bar - hp.hp / hp.maxHp) > 1e-9) badBars++;
          }
        }
      });
    } finally { console.warn = warn; }
    ok('LV-1', firstDrawn !== null && firstDrawn <= 1000, `after Enter the hero was first drawn ${firstDrawn} ms after (budget 1000)`);
    ok('LV-1', firstWalk !== null && firstWalk <= 1000, `after Enter the hero first walked ${firstWalk} ms after (budget 1000)`);
    ok('LV-1', travelPlate >= travelFrames * 0.9, `the travel line showed in ${travelPlate} of ${travelFrames} travel frames`);
    ok('LV-2', liveDelay !== null && liveDelay <= delay, `the live view plays ${liveDelay} ms behind (want <= ${delay})`);
    ok('LV-2', firstMove !== null && firstMove <= 1000, `the hero first moved ${firstMove} ms after the engine started (budget 1000)`);
    ok('LV-2', empty === 0, `${empty} frame(s) after the engine started drew no hero`);
    ok('LV-2', maxStep <= BUDGET.maxStepTiles, `a frame moved the hero ${maxStep.toFixed(2)} tiles (budget ${BUDGET.maxStepTiles})`);
    /* DRAWN AT ITS OWN SPEED (live v0.2.20 "choppy"): every step rolls at the engine's speed, a diagonal
       too, and the first step is never cut across two tiles (was 4.5 tiles/s on diagonals, 9.1 at the start). */
    const heroSpeed = M.ROLES.HUNT_ROLES.tank.speed / 1000;
    ok('LV-2', maxSpeed <= heroSpeed * BUDGET.speedSlack, `the hero was drawn at ${maxSpeed.toFixed(2)} tiles/s (its speed ${heroSpeed}, budget x${BUDGET.speedSlack})`);
    ok('LV-2', maxBurst <= BUDGET.maxEventSpreadMs, `one frame played ${maxBurst} ms of events at once (a burst)`);
    ok('LV-5', unnamed === 0, `${unnamed} unit(s) had no sprite (drawn as nothing; was a brown stub box)`);
    ok('LV-5', kinds.size >= 2, `only ${[...kinds].join(', ')} monsters were drawn`);
    ok('LV-5', bars > 0 && badBars === 0, `${badBars} of ${bars} monster bars were not the HP at the instant shown`);
    console.log(`  LV-1/2 live: drawn ${firstDrawn} ms and walking ${firstWalk} ms after Enter (travel line ${travelPlate}/${travelFrames}); engine start -> first move ${firstMove} ms; ${frames} frames, max step ${maxStep.toFixed(3)} tiles (${maxSpeed.toFixed(2)} tiles/s), widest event frame ${maxBurst} ms, delay ${liveDelay} ms; monsters ${[...kinds].join('/')}, ${bars} bars`);
  }

  { // LV-6
    const mis = [LIVE_H.memberOf(LM, 'a', 0, 'tank', 6), LIVE_H.memberOf(LM, 'b', 1, 'melee_dps', 6)];
    let frames = 0, both = 0, heroCount = 0;
    await playLive(M, LM, book, mis, 60000, ({ s, f, T0, cs }) => {
      if (s < T0 + 2000) return;
      frames++;
      const heroIds = cs.live.heroUnits().map((x) => x.unit);
      heroCount = heroIds.length;
      const drawn = new Set([f.hero && f.hero.unit, ...f.units.map((d) => d.unit)]);
      if (heroIds.every((u) => u !== null && drawn.has(u))) both++;
      else if (process.env.HR_DEBUG && frames % 300 === 0) console.log('    missing', s - T0, JSON.stringify(heroIds), [...drawn].join(','));
    });
    ok('LV-6', frames > 0 && both === frames && heroCount === 2, `both party heroes were drawn in ${both} of ${frames} frames`);
  }

  { // LV-7 START: Enter 1.5 s before the instance's first boundary (a party join, a quick re-enter): the
    // floor answers not_due until it; the live engine must still start within a second of the boundary
    // (v0.2.20 gave up after two asks and played the hunt a whole poll late, or never live).
    let started = null, moved = null, prev = null;
    await playLive(M, LM, book, [LIVE_H.memberOf(LM, 'a', 0, 'tank', 6)], 20000, ({ s, f, cs, T0 }) => {
      if (s < T0) return;
      if (started === null && cs.live.running()) started = Math.round(s - T0);
      const h = f.hero;
      if (h && prev && moved === null && Math.hypot(h.x - prev.x, h.y - prev.y) > 1e-6) moved = Math.round(s - T0);
      prev = h;
    }, { travelMs: 1500 });
    console.log(`  LV-7 start: engine ${started} ms and hero moving ${moved} ms after the first boundary (Enter 1.5 s before it)`);
    ok('LV-7', started !== null && started <= 1000 && moved !== null && moved <= 1000,
      `entered 1.5 s before the first boundary, the live engine started ${started} ms and the hero moved ${moved} ms after it (budget 1000)`);
  }

  { // LV-8 A PARTY VIEWED IN TURN, the viewer's client never landing the settle (another member's
    // client settles first, so this session only ever gets start points): for EACH member as the viewer,
    // the prediction never falls behind the server's clock (no freeze) and no unit moves more than a
    // frame's walk in one frame (no teleport). v0.2.20: the leader's tab froze, then jumped.
    const mis = () => [LIVE_H.memberOf(LM, 'a', 0, 'tank', 6), LIVE_H.memberOf(LM, 'b', 1, 'melee_dps', 6)];
    for (const viewer of ['a', 'b']) {
      let lag = 0, stalled = 0, jump = 0, frames = 0; const prev = new Map();
      await playLive(M, LM, book, mis(), 70000, ({ s, f, cs, T0 }) => {
        if (s < T0 + 1000) return;
        frames++;
        const now = cs.timeline.serverNowAt(cs.now());
        if (!cs.live.running()) stalled++;
        else lag = Math.max(lag, now - cs.live.nextAt());
        for (const d of [f.hero, ...f.units]) {
          if (!d || d.under) continue;
          const q = prev.get(d.unit);
          if (q) jump = Math.max(jump, Math.hypot(d.x - q.x, d.y - q.y));
          prev.set(d.unit, { x: d.x, y: d.y });
        }
      }, { viewer, otherFirst: true });
      console.log(`  LV-8 viewer ${viewer} (another client settles first): ${frames} frames, ${stalled} stalled, engine lag max ${Math.round(lag)} ms, largest frame step ${jump.toFixed(3)} tiles`);
      ok('LV-8', frames > 0 && stalled === 0 && lag <= BUDGET.lagMs, `viewer ${viewer}: the prediction stalled ${stalled} frame(s) and fell ${Math.round(lag)} ms behind the server (budget ${BUDGET.lagMs})`);
      ok('LV-8', jump <= BUDGET.frameStepTiles, `viewer ${viewer}: a frame moved a unit ${jump.toFixed(2)} tiles (budget ${BUDGET.frameStepTiles})`);
    }
  }

  { // LV-10 A RESUME NEVER TELEPORTS: the network drops for 40 s and the prediction runs out of seeds and
    // stands. (own) The viewer's own settle ends the outage while the prediction waits: that commit's
    // window (the past 40 s) must not be played into the units the prediction draws, a SECOND POSITION
    // SOURCE (v0.2.20 fed it as the server-paced view and the hero bounced). (other) Another client kept
    // settling through the outage, so the restart's start point is from an older commit, behind the
    // clock: its missed swings are run unplayed and every unit eases on (timeline.js T8), never jumps.
    for (const other of [false, true]) {
      let stalled = 0, after = 0, jump = 0, frames = 0, foreign = 0, past = 0; const prev = new Map();
      const warn = console.warn; console.warn = () => {};
      try {
        await playLive(M, LM, book, [LIVE_H.memberOf(LM, 'a', 0, 'tank', 6)], 70000, ({ s, f, cs, T0, sources }) => {
          foreign = sources.foreign; past = sources.past;
          if (s < T0 + 1000) return;
          if (!cs.live.running()) stalled++;
          const back = s >= T0 + 50000;
          if (back) frames++;
          for (const d of [f.hero, ...f.units]) {
            if (!d || d.under) continue;
            const q = prev.get(d.unit);
            if (q && back) { const st = Math.hypot(d.x - q.x, d.y - q.y); jump = Math.max(jump, st); if (st > BUDGET.maxStepTiles) after++; }
            prev.set(d.unit, { x: d.x, y: d.y });
          }
        }, { hold: [LIVE_H.T0 + 10000, LIVE_H.T0 + 50000], otherFirst: other });
      } finally { console.warn = warn; }
      const tag = other ? 'other' : 'own';
      console.log(`  LV-10 (${tag}) resume after a 40 s outage: ${stalled} stalled frame(s) during it; after it ${frames} frames, largest frame step ${jump.toFixed(3)} tiles, ${foreign} server window(s) played over the prediction, ${past} batch(es) of the past played late`);
      ok('LV-10', past === 0, `(${tag}) ${past} batch(es) of steps more than two swings old were played (the past drawn at once)`);
      ok('LV-10', stalled > 0, `(${tag}) CONTROL: a 40 s outage never ran the look-ahead dry`);
      ok('LV-10', foreign === 0, `(${tag}) ${foreign} server window(s) were played into the timeline while a prediction existed (a second position source)`);
      ok('LV-10', frames > 0 && jump <= BUDGET.maxStepTiles, `(${tag}) after the outage a frame moved a unit ${jump.toFixed(2)} tiles (${after} frame step(s) over ${BUDGET.maxStepTiles}: a teleport)`);
    }
  }

  { // LV-9 ONE HUNT AT A TIME: Mill Cellar, back to town, then the Millrace Sewer on the SAME session. No
    // unit of the second hunt is drawn on a tile its ground cannot be walked on, and none slides across the
    // map in one frame (v0.2.20: the last hunt's units, ids restarting at 1, stood in the new ground's walls).
    const T0 = LIVE_H.T0, T1 = T0 + 40000, OFF = 3000000;
    const A = LIVE_H.server(LM, [LIVE_H.memberOf(LM, 'a', 0, 'tank', 6)]);
    const misB = [LIVE_H.memberOf(LM, 'a', 0, 'tank', 6)];
    misB[0].huntSession = Object.assign({}, misB[0].huntSession, { id: 's-b', instanceId: 'i-b', huntFromMs: T1, nextSwingAtMs: T1 });
    const Bs = LIVE_H.server(LM, misB, { hunt: 'millrace_sewer', id: 'i-b', t0: T1 });
    const grid = LM.HG.huntGroundOf('millrace_sewer').grid;
    const clock = { t: T0 - OFF }; let version = LIVE.version;
    const phase = () => { const s = clock.t + OFF; return s < T0 + 30000 ? 'A' : s < T1 ? 'town' : 'B'; };
    const env = () => {
      const e = clone(LIVE); e.version = ++version; e.now = new Date(clock.t + OFF).toISOString();
      const p = phase();
      if (p === 'town') { e.hunt = null; return e; }
      const srv = p === 'A' ? A : Bs;
      e.hunt.pose = null; e.hunt.hero.unit = null; e.hunt.hunt_id = srv.inst.hunt; e.hunt.session_id = e.hunt.session.id = 'sess-' + p;
      e.hunt.session.hunt_from = new Date(p === 'A' ? T0 : T1).toISOString();
      e.party.members = [Object.assign(clone(LIVE.party.members[0]), { seat: 0, unit: null })]; e.party.self = null; e.party.leader = null;
      return e;
    };
    const last = { A: T0, B: T1 };
    const server = {
      rpc: async () => ({ ok: true, body: env() }),
      accrue: async () => {
        const s = clock.t + OFF, p = phase();
        if (p === 'town') return { ok: true, body: Object.assign(env(), { accrued: false }) };
        const srv = p === 'A' ? A : Bs;
        if (s <= srv.inst.settled_to_ms) return { ok: true, body: Object.assign(env(), { accrued: false, settled: false, reason: 'not_due' }) };
        if (s - last[p] >= 15000) { const c = srv.commit(s); last[p] = s; if (c) return { ok: true, body: Object.assign(env(), { accrued: true, settled: true, hunt_check: c.check }, c.tl) }; }
        return { ok: true, body: Object.assign(env(), { accrued: false, settled: false, reason: 'below_min_span', hunt_live: srv.live('a') }) };
      },
    };
    const timers = [];
    const cs = new M.C.CharacterSession({ slot: 0, uid: '11111111-2222-3333-4444-555555555555', server,
      setTimer: (fn, ms) => { timers.push({ fn, at: clock.t + ms }); return timers.length; }, clearTimer: () => {}, now: () => clock.t });
    await cs.load();
    let scene = null, off = null, was = null, frames = 0, walled = 0, first = null, jump = 0; let prev = new Map();
    const warn = console.warn; console.warn = () => {};
    try {
      for (let s = T0; s < T1 + 20000; s += 1000 / 60) {
        clock.t = s - OFF;
        const p = phase();
        if (p !== was) { was = p; if (p !== 'A') { await cs.hello(); await new Promise((r) => setImmediate(r)); } if (off) off(); scene = null; prev = new Map(); }
        for (let i = 0; i < timers.length; i++) if (timers[i] && timers[i].at <= clock.t) { const t = timers[i]; timers[i] = null; t.fn(); await new Promise((r) => setImmediate(r)); }
        if (p === 'town') continue;
        if (!scene) { const sc = M.S.createHuntScene({ timeline: cs.timeline, book, read: () => M.S.readHunt(cs) }); scene = sc; off = cs.timeline.subscribe((ev) => sc.onEvent(ev, cs.now())); }
        cs.liveAdvance(clock.t);
        const back = cs.takeReseeded(); if (back) scene.revive(back, clock.t);
        cs.timeline.advance(clock.t);
        const f = scene.frame(clock.t);
        if (p !== 'B') continue;
        frames++;
        for (const d of [f.hero, ...f.units]) {
          if (!d || d.under || d.unit < 0) continue;
          if (!M.GRID.walkable(grid, Math.round(d.x), Math.round(d.y))) { walled++; if (!first) first = d.unit + '@' + d.x.toFixed(1) + ',' + d.y.toFixed(1); }
          const q = prev.get(d.unit); if (q) jump = Math.max(jump, Math.hypot(d.x - q.x, d.y - q.y));
          prev.set(d.unit, { x: d.x, y: d.y });
        }
      }
    } finally { console.warn = warn; }
    console.log(`  LV-9 second hunt (Sewer after Cellar): ${frames} frames, ${walled} unit-frame(s) on a blocked tile${first ? ' (first ' + first + ')' : ''}, largest frame step ${jump.toFixed(3)} tiles`);
    ok('LV-9', frames > 0 && walled === 0, `the second hunt drew ${walled} unit-frame(s) on tiles its ground cannot be walked on (first ${first})`);
    ok('LV-9', jump <= BUDGET.frameStepTiles, `the second hunt moved a unit ${jump.toFixed(2)} tiles in one frame (budget ${BUDGET.frameStepTiles})`);
  }

  { // LV-11 THE LOOK-AHEAD KEPT FULL: a party member's view whose answers half the time bring no seeds (live
    // v0.2.21: 8 of 18 hr-accrue answers led to hr_load; the prediction ran dry and stood for seconds, about
    // once a minute) with real latency. The session asks before the seeds run out: no frame waits for them,
    // and it asks at most about twice as often as the ordinary poll.
    const mis = [LIVE_H.memberOf(LM, 'a', 0, 'tank', 6), LIVE_H.memberOf(LM, 'b', 1, 'melee_dps', 6)];
    let frames = 0, dry = 0, asks = 0;
    await playLive(M, LM, book, mis, 120000, ({ s, cs, T0 }) => {
      if (s < T0 + 2000) return;
      frames++;
      if (cs.live.stalled()) dry++;   // a prediction that ran and then ran out of seeds
    }, { viewer: 'a', otherFirst: true, latencyMs: 850, seedless: (n) => { asks = n + 1; return 'SNNSSSSNSNNSSSNSNN'[n % 18] === 'N'; } });
    const cap = Math.ceil((120000 / M.CFG.SESSION_CONFIG.huntPollMs) * 2) + 4;
    console.log(`  LV-11 half the answers seedless, 850 ms latency: ${frames} frames, ${dry} with the prediction out of seeds, ${asks} asks in 120 s (cap ${cap})`);
    ok('LV-11', frames > 0 && dry === 0, `the prediction ran out of seeds for ${dry} of ${frames} frames (the hunt stood still, then caught up)`);
    ok('LV-11', asks <= cap, `the view asked ${asks} times in 120 s (cap ${cap})`);
  }

  { // LV-12 A DEATH INSIDE A CATCH-UP IS PLAYED: the frame loop stops for 5 s (a background tab) across two
    // kills, then catches up. No monster the server's world holds dead is drawn standing a second later, and
    // none stands at 0 HP (live v0.2.21: "the kobold was still standing at the end", its bar empty/black).
    let frames = 0, ghost = 0, zeroHp = 0, jump = 0, lastSettled = null, hooked = false;
    const seen = new Set(), deadAt = new Map(), zero = new Map(), prev = new Map(), fell = new Set();
    const PAUSE = [LIVE_H.T0 + 46000, LIVE_H.T0 + 51000];
    await playLive(M, LM, book, [LIVE_H.memberOf(LM, 'a', 0, 'tank', 6)], 70000, ({ s, f, cs, T0, srv }) => {
      /* each death the screen plays (the fall, its loot and XP): a death inside the pause is PLAYED, not just laid down */
      if (!hooked) { hooked = true; cs.timeline.subscribe((ev) => { if (ev.type === 'kill') fell.add(ev.t); }); }
      if (srv.inst.world && srv.inst.settled_to_ms !== lastSettled) {
        lastSettled = srv.inst.settled_to_ms;
        const w = LM.WS.decode(JSON.parse(srv.inst.world));
        const alive = new Set(w.units.filter((u) => u.alive).map((u) => u.id));
        for (const u of w.units) seen.add(u.id);
        for (const u of seen) if (!alive.has(u) && !deadAt.has(u)) deadAt.set(u, lastSettled);
      }
      if (s < T0 + 2000) return;
      frames++;
      const now = cs.now(), shown = cs.timeline.serverNowAt(now) - cs.timeline.delayMs();
      for (const d of f.units) {
        if (d.under) { zero.delete(d.unit); continue; }
        if (deadAt.has(d.unit) && shown > deadAt.get(d.unit) + 1000) ghost++;
        const hp = cs.timeline.hpAt(d.unit, now);
        if (hp && hp.hp <= 0) { const z = zero.get(d.unit) ?? s; zero.set(d.unit, z); if (s - z > 500) zeroHp++; } else zero.delete(d.unit);
      }
      for (const d of [f.hero, ...f.units]) {
        if (!d || d.under) continue;
        const q = prev.get(d.unit);
        if (q && q.s >= T0 + 51000) jump = Math.max(jump, Math.hypot(d.x - q.x, d.y - q.y));   // frame to frame after the pause
        prev.set(d.unit, { x: d.x, y: d.y, s });
      }
    }, { pause: PAUSE, hold: PAUSE });   // a background tab whose polls are held too: the same prediction catches up
    const inPause = [...deadAt].filter(([, at]) => at > PAUSE[0] && at <= PAUSE[1] + 16000).map(([u]) => u);
    const unplayed = inPause.filter((u) => !fell.has(u));
    console.log(`  LV-12 5 s background pause across two kills: ${frames} frames, ${ghost} unit-frame(s) standing after the server had it dead, ${zeroHp} standing at 0 HP, ${inPause.length - unplayed.length}/${inPause.length} deaths of the span played, largest frame step after it ${jump.toFixed(3)} tiles`);
    ok('LV-12', inPause.length > 0 && unplayed.length === 0, `${unplayed.length} of ${inPause.length} deaths inside the pause were never played (units ${unplayed.join(', ')})`);
    { // a restart drops the queued future and the restarted prediction hands the same events back: they play once, their HP once
      const OFF = 1000000, T = 80000;
      const tl = M.TL.createTimeline({ delayMs: 0 });
      const ev = [{ id: (T + 500) + '.0', type: 'dmg', u: 1, t: 9, amount: 5, atMs: T + 500 }, { id: (T + 600) + '.0', type: 'kill', u: 1, t: 9, atMs: T + 600 }];
      tl.ingest({ serverNowMs: T, units: { 9: ['rat', 20, 20] }, fromMs: T, track: [{ u: 9, x: 3, y: 3, atMs: T }], events: ev }, T - OFF);
      tl.rebase(T + 100, new Map([[9, [3, 3]]]), 250);
      const hpAfterRebase = tl.hpAt(9, T + 700 - OFF).hp;
      tl.ingest({ events: ev }, T + 100 - OFF);
      const got = [];
      tl.subscribe((e) => got.push(e.type));
      tl.advance(T + 700 - OFF);
      ok('LV-12', hpAfterRebase === 20, `after a restart dropped a queued hit, the rat's bar still counted it (${hpAfterRebase}/20)`);
      ok('LV-12', got.join(',') === 'dmg,kill' && tl.hpAt(9, T + 700 - OFF).hp === 15, `the restarted prediction's hit and death played as [${got.join(',')}] at HP ${tl.hpAt(9, T + 700 - OFF).hp} (want dmg,kill at 15)`);
    }
    ok('LV-12', frames > 0 && ghost === 0, `${ghost} unit-frame(s) drew a monster standing a second after the server's world had it dead`);
    ok('LV-12', zeroHp === 0, `${zeroHp} unit-frame(s) drew a standing monster at 0 HP (an empty bar)`);
    ok('LV-12', jump <= BUDGET.maxStepTiles, `after the pause a frame moved a unit ${jump.toFixed(2)} tiles (budget ${BUDGET.maxStepTiles})`);
  }

  { // LV-13 A RESTART NEVER POPS A MONSTER: one the drawing killed that the restart finds alive fades back in
    // (never stands up off its corpse at full colour: live v0.2.21 "monsters standing up after death"), and
    // one drawn standing that the restart no longer has falls where it stands.
    const OFF = 1000000, T = 50000;
    const tl = M.TL.createTimeline({ delayMs: 0 });
    tl.ingest({ serverNowMs: T, units: { 7: ['rat', 20, 20], 8: ['rat', 20, 20] }, fromMs: T,
      track: [{ u: 7, x: 3, y: 3, atMs: T }, { u: 8, x: 5, y: 3, atMs: T }],
      events: [{ id: 'k7', type: 'kill', u: 1, t: 7, atMs: T + 100 }] }, T - OFF);
    const read = () => ({ units: new Map(), heroes: new Map(), people: new Map(), viewed: null, viewedShield: null, entrance: null,
      huntName: null, huntFromMs: null, self: null, look: null, shown: () => true });
    const sc = M.S.createHuntScene({ timeline: tl, book, read });
    tl.subscribe((ev) => sc.onEvent(ev, T + 200 - OFF));
    tl.advance(T + 200 - OFF);
    const before = sc.frame(T + 600 - OFF).units.find((d) => d.unit === 7);
    sc.revive(new Set([7]), T + 600 - OFF);
    const f = sc.frame(T + 650 - OFF);
    const back = f.units.find((d) => d.unit === 7), gone = f.units.find((d) => d.unit === 8);
    ok('LV-13', before && before.under, 'CONTROL: the killed rat was not drawn dead before the restart');
    ok('LV-13', back && !back.under && back.alpha <= 0.25, `a rat the restart found alive was drawn at alpha ${back && back.alpha} 50 ms after it (want a fade from 0, not a pop)`);
    ok('LV-13', gone && gone.under, 'a rat drawn standing that the restart no longer has was still drawn standing');
  }

  { // LV-18 SWITCHED AWAY AND BACK MID-HUNT (Andy 10-21: "When you tab away to another character while
    // monsters are dead in the pull (and had disappeared), they jump back"). The World pane is remounted on
    // every switch; the scene must be the character's, so a monster drawn dead before the switch is never
    // drawn standing after it, and no corpse plays its fall a second time.
    const SW = [LIVE_H.T0 + 40000, LIVE_H.T0 + 46000];
    const fell = new Map();   // unit -> 'before' | 'after': first drawn dead before or after the switch
    const lies = new Map();   // unit -> { anim, frame, dir } last drawn dead
    let rose = 0, replayed = 0, turned = 0, deadBefore = 0, framesAfter = 0;
    const roseIds = new Set();
    await playLive(M, LM, book, [LIVE_H.memberOf(LM, 'a', 0, 'tank', 6)], 70000, ({ s, f, T0 }) => {
      if (s < T0) return;
      const after = s >= SW[1];
      if (after) framesAfter++;
      const drawn = new Map(f.units.map((d) => [d.unit, d]));
      for (const [u, when] of fell) {
        const d = drawn.get(u);
        if (d && !d.under) { rose++; roseIds.add(u + ':' + when); }
      }
      for (const d of f.units) {
        if (!d.under) continue;
        if (!fell.has(d.unit)) fell.set(d.unit, after ? 'after' : 'before');
        const l = lies.get(d.unit);
        if (l && ((l.anim === 'corpse' && d.anim === 'death') || (l.anim === 'death' && d.anim === 'death' && d.frame < l.frame))) replayed++;
        if (l && l.dir !== d.dir) turned++;
        lies.set(d.unit, { anim: d.anim, frame: d.frame, dir: d.dir });
      }
    }, { switchAt: SW });
    deadBefore = [...fell.values()].filter((w) => w === 'before').length;
    console.log(`  LV-18 switched away ${(SW[1] - SW[0]) / 1000} s mid-hunt: ${deadBefore} monster(s) dead before it, ${rose} unit-frame(s) drew a dead monster standing (${[...roseIds].slice(0, 4).join(', ')}), ${replayed} replayed a fall, ${turned} turned a corpse`);
    ok('LV-18', deadBefore > 0 && framesAfter > 0, `CONTROL: ${deadBefore} monsters died before the switch, ${framesAfter} frames after it`);
    ok('LV-18', rose === 0, `${rose} unit-frame(s) drew a monster standing after it was drawn dead (${[...roseIds].slice(0, 4).join(', ')})`);
    ok('LV-18', replayed === 0, `${replayed} frame(s) played a corpse's fall again`);
    ok('LV-18', turned === 0, `${turned} frame(s) turned a corpse to another facing`);
  }

  { // LV-19 A UNIT DIES ONCE, AND LIES THE WAY IT FELL (Andy 10-21: "saw a corpse twitch again once dead"):
    // a second kill of a corpse (a restart re-running a death the screen played) never restarts its fall,
    // and a corpse never turns to face the hero it last swung at as that hero walks around it.
    const OFF = 1000000, T = 60000;
    const tl = M.TL.createTimeline({ delayMs: 0 });
    tl.ingest({ serverNowMs: T, units: { 7: ['rat', 20, 20], 1: ['outfit_knight', 100, 100] }, fromMs: T,
      track: [{ u: 7, x: 5, y: 5, atMs: T }, { u: 1, x: 6, y: 5, atMs: T }, { u: 1, x: 6, y: 6, atMs: T + 1500 }, { u: 1, x: 5, y: 6, atMs: T + 2000 },
        { u: 1, x: 4, y: 6, atMs: T + 2500 }, { u: 1, x: 4, y: 5, atMs: T + 3000 }, { u: 1, x: 4, y: 4, atMs: T + 3500 }],
      events: [{ id: 'm1', type: 'miss', u: 7, t: 1, atMs: T + 100 }, { id: 'k1', type: 'kill', u: 1, t: 7, atMs: T + 400 },
        { id: 'k2', type: 'kill', u: 1, t: 7, atMs: T + 2600 }] }, T - OFF);
    const read = () => ({ units: new Map(), heroes: new Map([[1, { seat: 0, role: 'tank', name: 'Hero' }]]), people: new Map(), viewed: 1, viewedShield: null,
      entrance: null, huntName: null, huntFromMs: null, self: null, look: 'outfit_knight', shown: () => true });
    const sc = M.S.createHuntScene({ timeline: tl, book, read });
    tl.subscribe((ev) => sc.onEvent(ev, T - OFF));
    const seen = [];
    for (let t = T + 400; t <= T + 4000; t += 50) { tl.advance(t - OFF); const d = sc.frame(t - OFF).units.find((x) => x.unit === 7); seen.push(d ? d.anim + ':' + d.frame + ':' + d.dir : 'gone'); }
    const dirs = new Set(seen.filter((x) => x !== 'gone').map((x) => x.split(':')[2]));
    let again = 0;
    for (let i = 1; i < seen.length; i++) { const [a0, f0] = seen[i - 1].split(':'), [a1, f1] = seen[i].split(':'); if ((a0 === 'corpse' && a1 === 'death') || (a0 === 'death' && a1 === 'death' && Number(f1) < Number(f0))) again++; }
    ok('LV-19', seen.every((x) => x !== 'gone') && seen[seen.length - 1].startsWith('corpse'), `CONTROL: the rat was not drawn lying as a corpse (${seen.slice(-3).join(' ')})`);
    ok('LV-19', again === 0, `a second kill of the corpse played its fall again (${seen.join(' ')})`);
    ok('LV-19', dirs.size === 1, `the corpse turned as the hero walked around it: facings ${[...dirs].join(',')}`);
  }

  { // LV-20 EVERY PARTY MEMBER WEARS ITS OUTFIT (Andy 10-21: "my outfit shows fine, but the other character in
    // party/hunt shows the standard knight"). Seat 1 is this account's other open character: drawn in that
    // character's own outfit (its server `outfit` section). Seat 2 is ANOTHER PLAYER: drawn in the outfit the
    // party section names for it (2026-11-04-party-outfits.sql member `outfit`). Both are tanks, whose role
    // default is the knight, so neither can pass by falling back to it.
    const UID = '11111111-2222-3333-4444-555555555555', THEM = '99999999-8888-4777-8666-555555555555';
    const mis = [LIVE_H.memberOf(LM, 'a', 0, 'tank', 6), LIVE_H.memberOf(LM, 'b', 1, 'tank', 6), LIVE_H.memberOf(LM, 'c', 2, 'tank', 6)];
    const other = { slot: 1, uid: UID, read: (k) => (k === 'outfit' ? { worn: 'witch', colors: {}, owned: ['witch'] } : undefined) };
    const want = { 1: 'outfit_witch', 2: 'outfit_ranger' };
    const frames = { 1: 0, 2: 0 }, dressed = { 1: 0, 2: 0 }, ids = { 1: new Set(), 2: new Set() };
    await playLive(M, LM, book, mis, 30000, ({ s, f, T0, cs: c }) => {
      if (s < T0 + 2000) return;
      for (const seat of [1, 2]) {
        const u = (c.live.heroUnits().find((x) => x.seat === seat) || {}).unit;
        const d = f.units.find((x) => x.unit === u);
        if (!d) continue;
        frames[seat]++; ids[seat].add(d.id);
        if (d.id === want[seat]) dressed[seat]++;
      }
    }, { people: [{ seat: 0, user: UID, slot: 0, name: 'Hero 1' }, { seat: 1, user: UID, slot: 1, name: 'Hero 2' }, { seat: 2, user: THEM, slot: 0, name: 'Mira' }],
      peers: () => [other], outfits: { 2: { id: 'ranger', colors: { body: 3 } } } });
    ok('LV-20', frames[1] > 0 && dressed[1] === frames[1], `your other hero (seat 1) was drawn as ${[...ids[1]].join('/')} in ${frames[1] - dressed[1]} of ${frames[1]} frames (want outfit_witch)`);
    ok('LV-20', frames[2] > 0 && dressed[2] === frames[2], `another player's hero (seat 2) was drawn as ${[...ids[2]].join('/')} in ${frames[2] - dressed[2]} of ${frames[2]} frames (want outfit_ranger, its party-section outfit)`);
  }

  { // LV-14 A SETUP CHANGED MID-HUNT, VIEWED (r10, Andy 10-20: "only takes effect for the next hunt"). The
    // server reads the action set afresh at every settle (hunt-settle.js memberInput), so the change reaches
    // the next commit; the browser kept predicting with the old setup until a later commit diverged.
    const NEW = { stance: 'offensive', distance: 3, chase: false, target_mode: 'weakest' };
    const mis = [LIVE_H.memberOf(LM, 'a', 0, 'tank', 6)];
    let last = null, sent = null, done = false, answered = null, reseedAt = null, before = null, after = null, server = null;
    const cs = await playLive(M, LM, book, mis, 90000, ({ s, cs: c, T0, srv }) => {
      server = srv;
      /* sent just after a commit, so the ask it makes lands below the settle floor: a start point whose
         world the prediction agrees with, carrying the new setup (the case the old view ignored) */
      if (sent === null && s >= T0 + 40000 && c.liveStats().match > (last ?? Infinity)) {
        sent = s; before = c.liveStats();
        c.setHuntOptions(0, NEW).then((r) => { done = r.ok === true; });
      }
      if (s >= T0 + 40000 && last === null) last = c.liveStats().match;
      if (done && answered === null) answered = s;
      if (answered !== null && reseedAt === null && c.liveStats().reseeds > before.reseeds) reseedAt = s;
    }, { rpc: (name, args) => {
      if (name !== 'hr_action_set_options') return undefined;
      /* the server stores the options; its next settle reads them (the stub's commits read `mis`) */
      mis[0].hero = LM.SPAWN.heroSetup({ weaponType: 'sword', options: Object.assign({}, args.p_opts), bar: [], partyRoles: ['tank', 'melee_dps'] });
      return { ok: true, body: { ok: true, preset: 0, options: args.p_opts } };
    } });
    after = cs.liveStats();
    const w = server && server.inst.world ? LM.WS.decode(JSON.parse(server.inst.world)) : null;
    const u = w && w.units.find((x) => x.side === 'hero');
    ok('LV-14', answered !== null, 'CONTROL: the settings intent was never answered');
    ok('LV-14', !!u && u.stance === NEW.stance && u.dist === NEW.distance && u.chase === NEW.chase && u.tmode === NEW.target_mode,
      `the server's hero unit after the change carries ${JSON.stringify(u && { stance: u.stance, dist: u.dist, chase: u.chase, tmode: u.tmode })}`);
    /* The floor has no start point until the instance's next boundary (hunt-settle.js not_due): one swing, then the ask. */
    const budget = LM.CB.tickMs + 1000;
    ok('LV-14', reseedAt !== null && reseedAt - answered <= budget,
      `after the settings answer the browser restarted its prediction ${reseedAt === null ? 'never' : Math.round(reseedAt - answered) + ' ms later'} (budget ${budget})`);
    ok('LV-14', before && after && after.diverged === before.diverged && after.match > before.match,
      `commits after the change: ${after.match - before.match} matched, ${after.diverged - before.diverged} diverged (the prediction ran the old setup)`);
    console.log(`  LV-14 mid-hunt setup: restarted ${reseedAt === null ? 'never' : Math.round(reseedAt - answered) + ' ms'} after the answer; commits after it matched ${after.match - before.match}, diverged ${after.diverged - before.diverged}`);
  }

  { // LV-3
    const cs = new M.C.CharacterSession({ slot: 0, uid: '11111111-2222-3333-4444-555555555555',
      server: { rpc: async () => ({ ok: true, body: clone(LIVE) }), accrue: async () => ({ ok: true, body: { ok: true, accrued: false } }) },
      setTimer: () => 0, clearTimer: () => {}, now: () => 1 });
    await cs.load();
    const h = M.HSX.huntOf(cs).hero;
    const want = (LIVE.hunt.hero.hp_max * 3 * LIVE.hunt.hero.regen_pm) / 1e6;
    ok('LV-3', h.hpPerS !== null && Math.abs(h.hpPerS - want) < 1e-9, `HP regen reads ${h.hpPerS}/s, want ${want}/s`);
    ok('LV-3', h.manaPerS !== null && Math.abs(h.manaPerS - LIVE.hunt.hero.mana_regen / 60) < 1e-9, `mana regen reads ${h.manaPerS}/s`);
    const src = readFileSync(join(M.base, 'src/shell/widgets/vitals-hub.js'), 'utf8');
    ok('LV-3', /regen\(hero\.hpPerS\)/.test(src) && /regen\(hero\.manaPerS\)/.test(src) && /'\/s'/.test(src), 'the vitals strip does not print hpPerS / manaPerS as /s');
  }
  { // LV-15 EVERY HP READOUT IS THE BAR'S (Andy 2026-10-21, the Warrens: "killed me while I appeared green"):
    // the vitals hub and the party panel read the HP the timeline plays at this instant (the bar over the
    // hero's head), not the last commit's, which is up to a commit window old.
    const clock = { t: 1000 };
    const cs = new M.C.CharacterSession({ slot: 0, uid: '11111111-2222-3333-4444-555555555555',
      server: { rpc: async () => ({ ok: true, body: clone(LIVE) }), accrue: async () => ({ ok: true, body: { ok: true, accrued: false } }) },
      setTimer: () => 0, clearTimer: () => {}, now: () => clock.t });
    await cs.load();
    const unit = M.HSX.huntOf(cs).hero.unit, maxHp = LIVE.hunt.hero.hp_max;
    const S = 5000000;
    cs.timeline.ingest({ serverNowMs: S + 1000, fromMs: S, units: { [unit]: ['hero', maxHp, maxHp] },
      events: [{ type: 'dmg', atMs: S + 500, u: 99, t: unit, amount: 120 }] }, clock.t);
    clock.t = 3000;
    const live = M.HSX.liveHpOf(cs, unit);
    ok('LV-15', live && live.hp === maxHp - 120, `the timeline plays the hero at ${live && live.hp} HP, want ${maxHp - 120}`);
    const stub = () => {
      const kids = new Map(), at = new Map();
      return { textContent: '', innerHTML: '', classList: { contains: () => false, toggle() {} },
        style: { getPropertyValue: () => '', setProperty() {}, removeProperty() {} },
        hasAttribute: (k) => at.has(k), getAttribute: (k) => (at.has(k) ? at.get(k) : null), setAttribute: (k, v) => at.set(k, v), removeAttribute: (k) => at.delete(k),
        querySelector(s) { if (!kids.has(s)) kids.set(s, stub()); return kids.get(s); } };
    };
    const el = stub();
    M.HUB.patchHub(el, { character: cs, glyphs: {}, now: () => clock.t });
    const shown = el.querySelector('[data-v="hp"]').textContent;
    ok('LV-15', shown === (maxHp - 120) + '/' + maxHp, `the vitals hub reads "${shown}" HP while the bar plays ${maxHp - 120}/${maxHp}`);
    const r = M.PP.liveRoster(cs, M.PP.rosterOf(cs));
    const me = r.members.find((m) => m.unit === unit);
    ok('LV-15', me && me.hp === maxHp - 120, `the party panel reads ${me && me.hp} HP for the hero while the bar plays ${maxHp - 120}`);
  }
  { // LV-15b ANOTHER MEMBER'S HP IS ITS BAR'S TOO: the party panel's row for a hunting party-mate reads the
    // HP the timeline plays for that member's unit, not the party section's last commit (LV-15 reads only
    // the viewed hero's own row, which r09 moved onto heroVitalsOf).
    const env = clone(LIVE), ALLY = 2, allyMax = 200;
    env.party = Object.assign({}, env.party, { max: 2, members: env.party.members.concat([Object.assign({},
      env.party.members[0], { seat: 1, unit: ALLY, name: 'Mate', hp: allyMax, hp_max: allyMax })]) });
    const clock = { t: 1000 };
    const cs = new M.C.CharacterSession({ slot: 0, uid: '11111111-2222-3333-4444-555555555555',
      server: { rpc: async () => ({ ok: true, body: clone(env) }), accrue: async () => ({ ok: true, body: { ok: true, accrued: false } }) },
      setTimer: () => 0, clearTimer: () => {}, now: () => clock.t });
    await cs.load();
    const hero = M.HSX.huntOf(cs).hero.unit, heroMax = LIVE.hunt.hero.hp_max;
    const S = 5000000;
    cs.timeline.ingest({ serverNowMs: S + 1000, fromMs: S, units: { [hero]: ['hero', heroMax, heroMax], [ALLY]: ['hero', allyMax, allyMax] },
      events: [{ type: 'dmg', atMs: S + 500, u: 99, t: ALLY, amount: 70 }] }, clock.t);
    clock.t = 3000;
    const live = M.HSX.liveHpOf(cs, ALLY);
    ok('LV-15b', live && live.hp === allyMax - 70, `the timeline plays the party-mate at ${live && live.hp} HP, want ${allyMax - 70}`);
    const r = M.PP.liveRoster(cs, M.PP.rosterOf(cs));
    const mate = r.members.find((m) => m.unit === ALLY);
    ok('LV-15b', mate && mate.hp === allyMax - 70 && mate.hpMax === allyMax,
      `the party panel reads ${mate && mate.hp}/${mate && mate.hpMax} HP for the party-mate while its bar plays ${allyMax - 70}/${allyMax}`);
  }
  return fails;
}

/* Five seconds of a page's frame loop: rAF gaps, and main-thread busy time per frame (CDP profiler). */
async function measureFrames(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  const ts = await page.evaluate(() => new Promise((ok) => {
    const out = []; const t0 = performance.now();
    const step = (t) => { out.push(t); if (t - t0 < 5000) requestAnimationFrame(step); else ok(out); };
    requestAnimationFrame(step);
  }));
  const { profile } = await cdp.send('Profiler.stop');
  const gaps = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  let busy = 0;
  profile.samples.forEach((id, i) => { if (byId.get(id).callFrame.functionName !== '(idle)') busy += (profile.timeDeltas[i] || 0) / 1000; });
  return { frames: ts.length, gapMed: gaps[gaps.length >> 1], busy: busy / Math.max(1, ts.length) };
}

async function pageRules() {
  const fails = [];
  const { chromium } = await import('playwright');
  const { launchOptions } = await import('./_chrome.mjs');
  const H = await import('./_client-harness.mjs');
  const LM = await LIVE_H.load(ROOT);
  const T0 = LIVE_H.T0;
  const mis = [LIVE_H.memberOf(LM, 'a', 0, 'tank', 6)];
  const srv = LIVE_H.server(LM, mis);
  /* The engine's clock mapped onto the page's: the hunt began 30 s before the page loads. */
  const start = Date.now() - 30000;
  const shift = (ms) => ms - T0 + start;
  const back = (ms) => ms - start + T0;
  for (let t = T0 + 16000; t <= back(Date.now()); t += 16000) srv.commit(t);
  const shiftLive = (live) => {
    const l = clone(live);
    l.instance.settled_to_ms = shift(l.instance.settled_to_ms); l.instance.next_swing_at_ms = shift(l.instance.next_swing_at_ms);
    for (const m of l.members) for (const k of ['huntFromMs', 'nextSwingAtMs']) if (Number.isFinite(m.huntSession[k])) m.huntSession[k] = shift(m.huntSession[k]);
    if (l.instance.world) {
      const w = LM.WS.decode(JSON.parse(l.instance.world));
      for (const u of w.units) for (const k of Object.keys(u)) if (/(At|Ms|Until)$/.test(k) && Number.isFinite(u[k]) && u[k] > 1e12) u[k] = shift(u[k]);
      l.instance.world = JSON.stringify(LM.WS.encode(w));
    }
    return l;
  };
  let version = LIVE.version;
  const env = () => { const e = clone(LIVE); e.version = ++version; e.now = new Date().toISOString(); e.hunt.pose = null;
    e.hunt.session.hunt_from = new Date(start).toISOString(); return e; };
  const { server, port } = await H.serve({});
  const browser = await chromium.launch(launchOptions({ headless: true }));
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: H.SDK_STUB }));
    await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
    await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
      const name = r.request().url().split('?')[0].split('/').pop();
      const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
      if (name === 'hr_load') return json(env());
      if (name === 'hr-accrue') return json(Object.assign(env(), { accrued: false, reason: 'below_min_span', hunt_live: shiftLive(srv.live('a')) }));
      return json({ ok: true });
    });
    await page.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'load' });
    await page.waitForSelector('form[data-auth="sign-in"]');
    await page.fill('input[name=email]', 'qa@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.click('.auth-submit');
    await page.waitForSelector('[data-app="play"][data-slot="0"]');
    await page.click('[data-app="play"][data-slot="0"]');
    await page.waitForSelector('.hs-launchers');
    await page.waitForTimeout(3000);
    const game = await measureFrames(page);
    const text = await page.evaluate(() => (document.querySelector('.hb-hub [data-r="hp"]') || {}).textContent || '');
    if (process.env.HR_SHOTS) await page.screenshot({ path: join(process.env.HR_SHOTS, 'hunt-live.png') });
    const simPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await simPage.route('**/*', (r) => (r.request().url().startsWith('http://127.0.0.1:') ? r.continue() : r.fulfill({ status: 204, body: '' })));
    await simPage.goto('http://127.0.0.1:' + port + '/prototypes/hunt-sim/index.html', { waitUntil: 'domcontentloaded' });
    await simPage.waitForTimeout(2500);
    const sim = await measureFrames(simPage);
    if (process.env.HR_SHOTS) await simPage.screenshot({ path: join(process.env.HR_SHOTS, 'hunt-sim.png') });
    console.log(`  LV-4 page: game ${game.frames} frames/5 s, gap median ${game.gapMed.toFixed(1)} ms, busy ${game.busy.toFixed(1)} ms/frame; sim ${sim.frames} frames, gap ${sim.gapMed.toFixed(1)} ms, busy ${sim.busy.toFixed(1)} ms/frame; ${errors.length} error(s)`);
    if (!/^\+\d+(\.\d)?\/s$/.test(text)) fails.push(`LV-3 the page's HP regen reads "${text}", want +N.N/s`);
    if (errors.length) fails.push('LV-4 page errors: ' + errors.slice(0, 3).join(' | '));
    if (!(game.gapMed <= BUDGET.gapMedianMs)) fails.push(`LV-4 the frame loop's median gap is ${game.gapMed.toFixed(1)} ms (budget ${BUDGET.gapMedianMs})`);
    const cap = sim.busy * BUDGET.simBusyFactor + BUDGET.simBusySlackMs;
    if (!(game.busy <= cap)) fails.push(`LV-4 the main thread is busy ${game.busy.toFixed(1)} ms per frame, over the sim's ${sim.busy.toFixed(1)} x ${BUDGET.simBusyFactor} + ${BUDGET.simBusySlackMs}`);
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  ['a read carries no clock (LV-0)', 'src/session/character-session.js', '      if (Number.isSafeInteger(ms)) this.timeline.ingest({ serverNowMs: ms }, this._now());\n    }\n    const h = this.read', '    }\n    const h = this.read', /^LV-0/],
  ['no stand-in before the first swing (LV-1)', 'src/hunt-view/scene.js', '    if (!hero && read.entrance) hero = (read.viewed !== null && unitAt(read.viewed, now, read.entrance)) || standIn(now);', '', /^LV-1/],
  ['the live view keeps the server-paced delay (LV-2)', 'src/session/live-link.js', 'this._tl.setDelay(SESSION_CONFIG.liveDelayMs);', 'void 0;', /^LV-2/],
  ['the frame loop never advances the engine (LV-2)', 'src/session/live-link.js', '    const n = this.engine.advance(now, (b) => this._tl.ingest(b, clientNow));', '    const n = 0;', /^LV-2/],
  ['a monster the snapshot dropped is unnamed (LV-5)', 'src/hunt-view/scene.js', "(typeof tl.kindOf === 'function' ? tl.kindOf(u) : null)", 'null', /^LV-5/],
  ["a bar is the snapshot's HP (LV-5)", 'src/hunt-view/scene.js', "const played = typeof tl.hpAt !== 'function' ? null : tl.hpAt(u, now);", 'const played = null;', /^LV-5/],
  ['steps drawn at their sub-step stamp over one tile time (LV-2)', 'src/hunt-view/live-engine.js', '    timeSteps(tl.hunt_track, (id) => speeds.get(id), s.drawn);\n', '', /^LV-2/],
  ['the live ask gives up after two tries (LV-7)', 'src/session/live-link.js', '    return Math.min(SESSION_CONFIG.huntPollMs, Math.max(back, until));', '    return this._tries > 2 ? null : SESSION_CONFIG.liveAskMs;', /^LV-7/],
  ['a start point with a new setup is ignored when its world agrees (LV-14)', 'src/session/live-link.js', '      if (this.engine.sameSetup(body.hunt_live)\n        && this._judge(', '      if (this._judge(', /^LV-14/],
  ['a mid-hunt settings answer asks for nothing (LV-14)', 'src/session/character-session.js', ' && this._huntOpen()) this.liveLink.ask();', ' && false) this.liveLink.ask();', /^LV-14/],
  ["a matching start point's seeds are dropped (LV-8)", 'src/session/live-link.js', '&& this._judge({ world_swing: i.world_swing, world_hash: i.world_hash, seeds: body.hunt_live.seeds }) ===', '&& this.engine.check({ world_swing: i.world_swing, world_hash: i.world_hash }) ===', /^LV-8/],
  ['missed swings are played at once (LV-10)', 'src/session/live-link.js', '    if (this.engine.behindMs(now) > this._tl.delayMs()) {', '    if (false) {', /^LV-10/],
  ['the poll waits for the ordinary poll however short the look-ahead (LV-11)', 'src/session/hunt-poll.js', ', liveLink.refillDelayMs() ?? SESSION_CONFIG.huntPollMs);', ', SESSION_CONFIG.huntPollMs);', /^LV-11/],
  ['a death inside a catch-up is not played (LV-12)', 'src/session/live-link.js', '    for (const ev of res.kills) {', '    for (const ev of []) {', /^LV-12/],
  ['a dropped event stays remembered (LV-12)', 'src/hunt-view/timeline.js', '{ seen.delete(queue[i].key); queue.splice(i, 1); }', '{ queue.splice(i, 1); }', /^LV-12/],
  ['a revived monster pops up (LV-13)', 'src/hunt-view/scene.js', '        if (t !== null) risen.set(u, t);\n', '', /^LV-13/],
  ['a monster the restart no longer has keeps standing (LV-13)', 'src/hunt-view/scene.js', '      for (const u of tl.units()) if (!alive.has(u) && !dead.has(u) && !isHero(u)) dead.set(u, t);\n', '', /^LV-13/],
  ['each World pane makes its own live scene (LV-18)', 'src/hunt-view/scene.js', '  if (had && had.key === o.key) return had.scene;\n', '', /^LV-18/],
  ['a second kill of a corpse plays its fall again (LV-19)', 'src/hunt-view/scene.js', '        if (!isHero(ev.t) && dead.has(ev.t)) return true;\n', '', /^LV-19/],
  ['a corpse turns to face what it last swung at (LV-19)', 'src/hunt-view/scene.js', '          ({ dir, diag } = lie.get(u));\n', '', /^LV-19/],
  ['another player\'s party outfit is not read (LV-20)', 'src/session/hunt-sections.js', 'outfit: outfitIdOf(m.outfit),', 'outfit: null,', /^LV-20/],
  ['your other hero in the party wears the role\'s outfit (LV-20)', 'src/hunt-view/scene.js', 'return (m && m.look) || outfitSprite(m && m.outfit, m && m.role);', 'return outfitSprite(m && m.outfit, m && m.role);', /^LV-20/],
  ['a waiting prediction takes the server window too (LV-10)', 'src/session/character-session.js', '    if (this.live.running() || this.live.stalled()) {', '    if (this.live.running()) {', /^LV-10/],
  ["the last hunt's units are kept (LV-9)", 'src/session/character-session.js', 'if (sid !== null && sid !== this._huntSid) { this.liveLink.off(); this.timeline.clear(); }', '', /^LV-9/],
  ['the per-minute figure printed as /s (LV-3)', 'src/shell/widgets/vitals-hub.js', 'regen(hero.hpPerS)', 'regen(hero.hpPerS * 60)', /^LV-3/],
  ['HP regen at the resting rate (LV-3)', 'src/session/hunt-sections.js', '* VITALS.inFightRegenPermillePerS *', '* 60 *', /^LV-3/],
  /* r09: the hub reads heroVitalsOf, the one reader it shares with the Character tab and the party panel's own row. */
  ["the hub reads the last commit's HP (LV-15, live v0.2.22)", 'src/session/character-sections.js', '    const live = liveHpOf(cs, hero.unit);', '    const live = null;', /^LV-15/],
  /* r09: the panel's own row reads heroVitalsOf; the commit's HP is the roster row's m.hp. */
  ["the party panel reads the last commit's HP (LV-15, live v0.2.22)", 'src/shell/widgets/party-panel.js', 'level: v.level, hp: v.hp, hpMax: v.hpMax', 'level: v.level, hp: m.hp, hpMax: m.hpMax', /^LV-15/],
  ["the party panel reads a party-mate's last-commit HP (LV-15b)", 'src/shell/widgets/party-panel.js', 'const live = m.hunting ? liveHpOf(cs, m.unit) : null;', 'const live = null;', /^LV-15b/],
];

async function mutate() {
  let escaped = 0;
  for (const [name, file, from, to, arm] of MUTANTS) {
    const base = mkdtempSync(join(tmpdir(), 'hr-hsl-'));
    try {
      cpSync(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
      cpSync(join(ROOT, 'assets', 'world'), join(base, 'assets', 'world'), { recursive: true });
      const p = join(base, file);
      const src = readFileSync(p, 'utf8');
      if (src.split(from).length !== 2) { console.error(`harness: anchor for "${name}" not found once`); process.exit(2); }
      writeFileSync(p, src.replace(from, to));
      let fails;
      try { fails = await nodeRules(await load(base)); } catch (e) { fails = ['threw: ' + e.message]; }
      const hit = fails.some((f) => arm.test(f));
      console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${name}${hit ? '' : ' (' + fails.join(' | ').slice(0, 200) + ')'}`);
      if (!hit) escaped++;
    } finally { rmSync(base, { recursive: true, force: true }); }
  }
  console.log(escaped ? `hunt-scene-live --mutate: ${escaped} mutant(s) ESCAPED` : `hunt-scene-live --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
  process.exit(escaped ? 1 : 0);
}



async function main() {
  if (process.argv.includes('--mutate')) return mutate();
  const M = await load(ROOT);
  const fails = await nodeRules(M);
  if (!process.argv.includes('--node')) fails.push(...await pageRules());
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? `hunt-scene-live: ${fails.length} rule(s) RED` : 'hunt-scene-live: Enter draws a walking hero, the live engine plays the hunt (party included), regen in real units, the page holds its frame budget');
  process.exit(fails.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
