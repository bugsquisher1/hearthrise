#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/perf-budget.mjs — THE HUNT PAGE HOLDS ITS FRAME, HEAP AND DOM BUDGET.
//
//   node tests/perf-budget.mjs                 the CI run: Chromium 1440x900, a 4-minute scenario, budgets
//   node tests/perf-budget.mjs --measure       the full table: Chromium AND Firefox, 1440x900 AND 922x423,
//                                              10 minutes each (--minutes N, --browsers chromium,firefox,
//                                              --sizes 1440x900,922x423 narrow it); prints, never fails
//   node tests/perf-budget.mjs --mutate        every planted defect must turn the budget RED
//
// mutant-anchors: src/world/world-boot.js src/world/render/canvas-backend.js src/app/world-pane.js src/shell/widgets/analyzer.js src/shell/shell.js src/session/character-session.js src/hunt-view/combat-log.js
// mutant-writes-tree: no — probes and mutants are served from memory (tests/_client-harness.mjs serve overrides)
//
// THE SCENARIO (Andy, Firefox, live v0.2.23: "the page is slowing down", "the analyser seems to have slowed
// down on real-time updates", "2nd char starts to run away after death"). The REAL client (play.html) over a
// scripted server whose hunt is the edge's own engine (tests/hunt-live.mjs HARNESS: hunt-settle.js huntLive,
// accrual.js accrueHunt) on The Sewer: a party of the account's two heroes at density 8, the first viewed.
// The server settles every 10 s (the pg_cron tick) and answers every poll with the asking hero's start point.
// Along the run: the analyzer open, a hero switch A -> B -> A, an alert storm (party invites, 20 s), a hidden
// tab (the frame loop held, then resumed), and the tank's death mid-pull (the party's hunt ends for both).
//
// WHAT IS MEASURED, in the page, the same way in both browsers:
//   fps            requestAnimationFrame gaps: median and the p5 frame rate, outside the hidden span
//   long frames    gaps > 50 ms (count, worst); the resume after the hidden span is reported apart
//   main thread    per frame: live-engine step, timeline + scene, canvas draw, the whole frame; per answer:
//                  the envelope applied (its listeners included); per tick: the shell's display tick
//   heap           Chromium only (CDP, after a forced GC): used JS heap after the warm-up vs at the end
//   DOM            element count after the warm-up vs at the end, and nodes ADDED per minute (a rebuild)
//   analyzer       patches per minute, its session clock against the hunt's real elapsed time (behind by,
//                  and how often it ran backwards), and the longest its kill count stood still while hunting
//   the run-away   the second hero's drawn path from the death on: how far it walks, and for how long
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { HARNESS as LIVE_H } from './hunt-live.mjs';
import { LOG_MAX_LINES } from '../src/data/combat-text.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/hunt-envelope-live.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const HUNT = 'millrace_sewer';
const WEAPON = Object.freeze({ melee_dps: 'hammer', ranger: 'ranged', tank: 'sword' });
const TICK_MS = 10000;   // the server's settle cadence (pg_cron, live-world-decision)

/* THE BUDGETS (Chromium, 1440x900, the 4-minute CI scenario), from the measured numbers plus margin. */
const BUDGET = Object.freeze({
  fpsMedianMin: 55,        // rAF frames per second, median over 1 s buckets
  fpsP5Min: 45,            // the 5th-percentile 1 s bucket
  longFrameMs: 100,        // no frame the PAGE held above this (its Long Tasks inside the gap), outside the hidden span and its resume
  longFramesMax: 6,        // frames the page held > 50 ms, outside the hidden span and its resume (a whole-browser stall is reported apart)
  heapGrowthMb: 4,         // used JS heap, warm-up -> end, both after a forced GC, the probe's own records stopped and
                           // released first (2026-10-22: they were 4-7 of CI's 8.7 MB; the game measured 1.0-1.2 MB, mostly JIT code)
  domGrowth: 150,          // elements, warm-up -> the death, the combat log's lines apart (they are capped on their own)
  addedPerMin: 3000,       // DOM nodes added per minute (a per-frame rebuild adds tens of thousands)
  analyzerBehindMs: 2500,  // the analyzer's session clock against the hunt's real elapsed time
  analyzerBackMs: 1500,    // the clock never runs backwards more than this
  paintsInAnswers: 2,      // shell repaints made INSIDE an applied answer (its cascade of emits is painted once, after it)
  drawsOffLoop: 6,         // World canvas draws outside the frame loop while it runs (mounts, a shown tab), never one per answer
});

/* ── the page's probes (served copies only: the shipped files never carry them) ── */
const PROBES = [
  ['src/world/world-boot.js', '    if (typeof character.liveAdvance === \'function\') character.liveAdvance(now);',
    '    if (typeof character.liveAdvance === \'function\') window.__perf.time(\'engine\', () => character.liveAdvance(now));'],
  ['src/world/world-boot.js', '    tl.advance(now);\n    const f = scene.frame(now);',
    '    const f = window.__perf.time(\'scene\', () => { tl.advance(now); return scene.frame(now); });\n    window.__perf.track(now, f);'],
  ['src/world/world-boot.js', '    backend.sync(Object.assign({ name: sc.kind === \'hunt\' ? null : name, roofAlpha, t: now }, cast));',
    '    window.__perf.time(\'draw\', () => backend.sync(Object.assign({ name: sc.kind === \'hunt\' ? null : name, roofAlpha, t: now }, cast)));'],
  ['src/world/world-boot.js', '    last = t;\n    step(dt);', '    last = t;\n    window.__perf.time(\'frame\', () => step(dt));'],
  ['src/shell/shell.js', 'const ticker = host.setInterval(patchComponents, DISPLAY_TICK_MS);',
    'const ticker = host.setInterval(() => window.__perf.time(\'shellTick\', patchComponents), DISPLAY_TICK_MS);'],
  ['src/shell/shell.js', '    paint() { followSummary(); paintWidgets(); for (const id of wm.openIds()) if (WINDOW_RENDERERS[id] && WINDOW_RENDERERS[id].patch) refresh(id); coach(); },',
    '    paint() { window.__perf.time(\'shellPaint\', () => { followSummary(); paintWidgets(); for (const id of wm.openIds()) if (WINDOW_RENDERERS[id] && WINDOW_RENDERERS[id].patch) refresh(id); coach(); }); },'],
  ['src/session/character-session.js', '  _take(body, why) {\n',
    '  _take(body, why) { return window.__perf.time(\'envelope\', () => this.__take(body, why)); }\n  __take(body, why) {\n'],
  ['src/shell/widgets/analyzer.js', 'renderAnalyzer.patch = function patchAnalyzer(el, ctx) {\n',
    'renderAnalyzer.patch = function patchAnalyzer(el, ctx) {\n  window.__perf.count(\'analyzer\');\n'],
];

/* ── the planted defects (--mutate): each must turn a budget red ── */
const MUTANTS = [
  ['a per-frame DOM rebuild (the world chrome re-rendered every frame)', 'src/world/world-boot.js',
    '  function step(dt) {\n    const G = view();\n', '  function step(dt) {\n    chrome.innerHTML = chrome.innerHTML;\n    const G = view();\n', /^(dom|fps|long)/],
  ['a per-frame buffer kept for ever (an unbounded push each frame; the heap measure must see it, not the probe)', 'src/world/world-boot.js',
    '  function step(dt) {\n    const G = view();\n', '  function step(dt) {\n    (globalThis.__kept || (globalThis.__kept = [])).push(new Array(128).fill(dt));\n    const G = view();\n', /^heap/, 'scenario', 4],
  ['the frame path blocks the main thread 200 ms every 20 s (a busy loop: the page, not the runner, holds the frame)', 'src/world/world-boot.js',
    '  function step(dt) {\n    const G = view();\n', '  function step(dt) {\n    { const b = Math.floor(performance.now() / 20000); if (b !== step.b) { step.b = b; const t = performance.now(); while (performance.now() - t < 200); } }\n    const G = view();\n', /^long frame/, 'scenario', 4],
  ['an unbounded log (the combat log keeps every line, rendered in the log)', 'src/hunt-view/combat-log.js',
    '    if (lines.length > LOG_MAX_LINES) lines.splice(0, lines.length - LOG_MAX_LINES);\n', '', /^(heap|dom)/, 'scenario', 4],
  ['every answer repaints the shell and draws the World again inside it (live v0.2.23)', 'src/app/world-pane.js',
    'const offChar = character.subscribe(() => { if (!queued) { queued = true; queueMicrotask(repaint); } });',
    'const offChar = character.subscribe(() => { if (runtime) runtime.sync(); shell.paint(); });', /^repaint/],
  ['the World draws a frame on every answer although its loop runs', 'src/world/world-boot.js',
    "if (panel.classList.contains('active') && !(running && live())) {", "if (panel.classList.contains('active')) {", /^repaint/, 'scenario', 4],
  ["the analyzer clock runs from each answer's arrival (live v0.2.23)", 'src/shell/widgets/analyzer.js',
    "clock(sessionClockMs(a, serverNowOf(ctx.character)))", "clock(a.sessionMs === null ? null : a.sessionMs + live)", /^analyzer/],
  ['a shadow mask kept although a monster moved', 'src/world/render/canvas-backend.js',
    "else if (sh.type === 'ellipse') k += '|e' + sh.cx + ',' + sh.cy + ',' + sh.w + ',' + sh.h;", "else if (sh.type === 'ellipse') k += '|e';", /^PB-PIX/, 'pix'],
  ["the light layer kept although the hero's lamp moved", 'src/world/render/canvas-backend.js',
    "for (const p of points) sig += '|' + p.x + ',' + p.y + ',' + p.r + ',' + tone('light-' + p.tint);", "for (const p of points) sig += '|' + p.r;", /^PB-PIX/, 'pix'],
];

/** The served copy of the client: every probe planted once (an anchor that moved is a harness error), then `extra`. */
export function planted(extra) {
  const files = {};
  const put = (file, from, to, what) => {
    const src = files[file] ?? readFileSync(join(ROOT, file), 'utf8');
    if (src.split(from).length !== 2) throw new Error(`harness: the anchor for ${what} in ${file} is not found exactly once`);
    files[file] = src.replace(from, () => to);
  };
  for (const [file, from, to] of PROBES) put(file, from, to, 'a probe');
  for (const [name, file, from, to] of extra || []) put(file, from, to, '"' + name + '"');
  return files;
}

/* The page's recorder: rAF gaps, the hidden-tab emulation, the probes' clocks, DOM churn, analyzer samples. */
const INIT = `(() => {
  const P = window.__perf = { t: Object.create(null), c: Object.create(null), frames: new Float64Array(120000), nf: 0,
    marks: [], samples: [], dom: [], added: 0, long: [], ltOk: false, path: [], trackOn: false, stopped: false };
  /* depth: a canvas draw or a shell paint INSIDE an applied answer is counted apart (one answer, one paint, no draw) */
  const depth = Object.create(null);
  P.time = (k, fn) => { const a = performance.now(); depth[k] = (depth[k] || 0) + 1;
    if (depth.envelope && k !== 'envelope' && !document.hidden) P.count(k + 'InEnvelope');
    if (k === 'draw' && !depth.frame && !document.hidden) P.count('drawOffLoop');
    try { return fn(); } finally { depth[k]--; const d = performance.now() - a;
    const r = P.t[k] || (P.t[k] = { n: 0, ms: 0, max: 0, over: 0 }); r.n++; r.ms += d; if (d > r.max) r.max = d; if (d > 16) r.over++; } };
  P.count = (k) => { P.c[k] = (P.c[k] || 0) + 1; };
  P.mark = (name) => P.marks.push([performance.now(), name]);
  let tn = 0;
  P.track = (now, f) => { if (P.stopped || (!P.trackOn && (tn++ % 15)) || P.path.length > 30000) return;
    const us = f.units.filter((u) => u.anim !== undefined).concat(f.hero ? [Object.assign({ anim: 'viewed' }, f.hero, { id: 'viewed' })] : []);
    P.path.push([performance.now(), us.map((u) => [u.unit, +(+u.x).toFixed(2), +(+u.y).toFixed(2), u.anim, u.id])]); };
  /* THE HIDDEN TAB: document.hidden flips, visibilitychange fires, requestAnimationFrame holds its callbacks. */
  const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
  let hidden = false; const held = new Map(); let hid = 0;
  window.requestAnimationFrame = (cb) => { if (!hidden) return raf(cb); held.set(--hid, cb); return hid; };
  window.cancelAnimationFrame = (id) => (id < 0 ? held.delete(id) : caf(id));
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  P.hide = (on) => { hidden = on; P.mark(on ? 'hidden' : 'shown'); document.dispatchEvent(new Event('visibilitychange'));
    if (!on) { const q = Array.from(held.values()); held.clear(); for (const cb of q) raf(cb); } };
  const rec = (t) => { if (P.nf < P.frames.length) P.frames[P.nf++] = t; window.requestAnimationFrame(rec); };
  window.requestAnimationFrame(rec);
  try { new PerformanceObserver((l) => { if (!P.stopped) for (const e of l.getEntries()) P.long.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); P.ltOk = (PerformanceObserver.supportedEntryTypes || []).includes('longtask'); } catch (e) {}
  const mo = new MutationObserver((ms) => { for (const m of ms) P.added += m.addedNodes.length; });
  const watch = () => mo.observe(document.documentElement, { childList: true, subtree: true });
  if (document.documentElement) watch(); else document.addEventListener('DOMContentLoaded', watch);
  setInterval(() => { if (P.stopped) return;
    const q = (s) => { const e = document.querySelector(s); return e ? e.textContent : null; };
    P.samples.push([Date.now(), performance.now(), q('.ha-analyzer [data-clock="session"]'), q('.ha-analyzer [data-sec="totals"] [data-stat="kills"]'), q('.ht-clock'), (document.querySelector('[data-live]') || { dataset: {} }).dataset.live || null]);
  }, 250);
  setInterval(() => P.stopped || P.dom.push([performance.now(), document.getElementsByTagName('*').length, P.added, document.querySelectorAll('.hc-line').length]), 2000);
})();`;

/* ── the scripted server ── */
async function makeServer(second = 'melee_dps') {
  const H = await import('./_client-harness.mjs');
  const LM = await LIVE_H.load(ROOT);
  const T0 = LIVE_H.T0;
  const UID = H.UID;
  const mis = [LIVE_H.memberOf(LM, UID, 0, 'tank', 14), LIVE_H.memberOf(LM, UID, 1, second, 14)];
  mis[1].key = UID + ':1'; mis[1].slot = 1;
  for (const m of mis) { m.huntId = HUNT; m.hero = Object.assign({}, m.hero, { density: 8 }); }
  const srv = LIVE_H.server(LM, mis, { hunt: HUNT });
  /* the hunt began about 30 s before the page loads; the engine's clock lands on the page's by whole minutes */
  const start = Date.now() - 30000 - (((Date.now() - 30000 - T0) % 60000) + 60000) % 60000;
  const shift = (ms) => ms - T0 + start;
  const back = (ms) => ms - start + T0;
  const NAMES = ['Ada', 'Bram'];
  const SESS = [randomUUID(), randomUUID()];
  const PARTY = randomUUID();
  const S = { ended: false, endedAt: null, killAt: null, storm: false, version: [LIVE.version, LIVE.version], tally: [0, 1].map(() => ({ kills: 0, xp: 0, gold: 0, loot: {} })) };
  const tick = () => {
    if (S.ended) return;
    const to = back(Date.now());
    const before = mis.map((m) => ({ xp: m.levelXp, gold: m.gold, unit: m.unitId }));
    const c = srv.commit(to - (to - T0) % 100);
    if (S.killAt !== null && to >= S.killAt && !S.killed) {
      /* THE TANK'S DEATH MID-PULL: from this settle on the tank's bar is empty (no food, no Challenge), a
         setup change the start points carry, so the browser's prediction plays the death live */
      mis[0].hero = Object.assign({}, mis[0].hero, { slots: [] });
      const w = LM.WS.decode(JSON.parse(srv.inst.world));
      const u = w.units.find((x) => x.id === mis[0].unitId);
      if (u) { u.hp = Math.max(1, Math.floor(u.maxHp * 0.15)); u.otHp = 0; }
      srv.inst.world = JSON.stringify(LM.WS.encode(w));
      S.killed = true;
    }
    if (!c) return;
    for (let i = 0; i < 2; i++) {
      const t = S.tally[i];
      t.xp += mis[i].levelXp - before[i].xp; t.gold += mis[i].gold - before[i].gold;
      for (const e of c.tl.hunt_events || []) if (e.type === 'kill' && e.u === before[i].unit) t.kills++;
    }
    if (mis.every((m) => m.unitId === null)) { S.ended = true; S.endedAt = shift(srv.inst.settled_to_ms); }
  };
  for (let t = T0 + TICK_MS; t <= back(Date.now()); t += TICK_MS) srv.commit(t);
  const timer = setInterval(tick, TICK_MS);
  /* Every instant in a start point (any number past 1e12: the world's units, cooldowns, lanes and pack
     respawns, the viewer's session, each peer's frozen one) moved onto the page's clock. */
  const deep = (o) => { if (Array.isArray(o)) return o.map(deep); if (o && typeof o === 'object') { for (const k of Object.keys(o)) o[k] = deep(o[k]); return o; }
    return typeof o === 'number' && o > 1e12 ? shift(o) : o; };
  const shiftLive = (live) => {
    const l = clone(live);
    const world = l.instance.world;
    l.instance.world = null;
    deep(l.instance); deep(l.members);
    if (world) {
      l.instance.world = JSON.stringify(LM.WS.encode(deep(LM.WS.decode(JSON.parse(world)))));
      l.instance.world_hash = LM.HT.worldHash(l.instance.world);   // the hash of the world as the page's clock reads it
    }
    return l;
  };
  const iso = (ms) => new Date(ms).toISOString();
  const analyzer = (slot, now) => {
    const t = S.tally[slot];
    const huntMs = Math.max(0, (S.ended ? S.endedAt : shift(srv.inst.settled_to_ms)) - start);
    const wallH = Math.max(1e-9, ((S.ended ? S.endedAt : now) - start) / 3600000);
    const view = { kills: t.kills, xp: { level: t.xp }, gold: t.gold, waste: 0, balance: t.gold,
      per_hour: (now - start) >= 600000 ? { xp: Math.round(t.xp / wallH), gold: Math.round(t.gold / wallH), waste: 0, balance: Math.round(t.gold / wallH) } : null,
      supplies: { own: {}, store: {} }, loot: {} };
    /* the shape of hr_hunt_analyzer_of: hunt_ms is hunted time up to the session's settled_to (hr_hunt_view) */
    return { session: { ended_at: S.ended ? iso(S.endedAt) : null, hunt_from: iso(start), settled_to: iso(S.ended ? S.endedAt : shift(srv.inst.settled_to_ms)) },
      hunt_ms: huntMs, wall_ms: now - start, hero: view, party: view };
  };
  const env = (slot) => {
    const now = Date.now();
    const e = clone(LIVE);
    e.version = ++S.version[slot]; e.now = iso(now); e.name = NAMES[slot]; e.state.slot = slot; e.state.active_id = HUNT;
    const unit = (i) => (mis[i].unitId === null ? (S.ended ? i + 1 : null) : mis[i].unitId);
    const h = e.hunt;
    h.pose = null; h.hunt_id = HUNT; h.session_id = SESS[slot]; h.hero.unit = unit(slot); h.hero.name = NAMES[slot];
    Object.assign(h.session, { id: SESS[slot], hunt: HUNT, seat: slot, unit: unit(slot), instance: srv.inst.id, entered_at: iso(start - 20000),
      hunt_from: iso(start), settled_to: iso(shift(srv.inst.settled_to_ms)) });
    Object.assign(h.instance, { id: srv.inst.id, kind: 'party', settled_to: iso(shift(srv.inst.settled_to_ms)) });
    if (S.ended) {
      h.ended = true;
      Object.assign(h.session, { phase: 'ended', ended_at: iso(S.endedAt), end_reason: slot === 0 ? 'died' : 'party_member_died' });
      e.state.active_kind = 'idle'; e.state.active_id = null;
    }
    e.party = { id: PARTY, max: 2, hunt: HUNT, open: false, self: unit(slot), leader: unit(0), self_seat: slot, leader_seat: 0,
      members: [0, 1].map((i) => Object.assign(clone(LIVE.party.members[0]), { seat: i, unit: unit(i), name: NAMES[i], weapon: i ? WEAPON[second] : 'sword', hunting: !S.ended })) };
    e.party_people = [0, 1].map((i) => ({ seat: i, user: UID, slot: i, name: NAMES[i] }));
    e.hunt_analyzer = analyzer(slot, now);
    e.party_invites = S.storm ? Array.from({ length: 5 }, () => ({ id: randomUUID(), hunt: HUNT, from: 'Mira' })) : [];
    return e;
  };
  const answer = (name, args) => {
    const slot = Number.isInteger(args && (args.p_slot ?? args.slot)) ? (args.p_slot ?? args.slot) : 0;
    if (name === 'hr_load') return env(slot);
    if (name === 'hr-accrue') {
      const e = env(slot);
      if (S.ended || mis[slot].unitId === null) return Object.assign(e, { accrued: false, settled: false, reason: 'not_due' });
      return Object.assign(e, { accrued: false, settled: false, reason: 'below_min_span', hunt_live: shiftLive(LM.HS.huntLive(srv.inst, mis, UID, slot)) });
    }
    return { ok: true };
  };
  return { H, start, S, answer, close: () => clearInterval(timer), deathIn: (ms) => { S.killAt = back(Date.now() + ms); } };
}

/* ── PB-PIX: A KEPT MASK IS THE MASK A REDRAW MAKES ──
   The World's shadow mask and light layer are re-drawn only when their inputs change
   (canvas-backend.js, signatures). Two backends on the same Sewer frames, one as shipped and one
   that re-draws both masks every frame, must paint the SAME pixels on every frame: the hero
   standing (masks kept), walking (re-drawn), a monster walking past while the hero stands, and the
   idle clips ticking on. */
const PIX_PAGE = `<!doctype html><html><head><link rel="stylesheet" href="/src/styles/tokens.css"></head>
<body style="margin:0"><div id="a" style="position:absolute;left:0;top:0;width:720px;height:420px"></div>
<div id="b" style="position:absolute;left:0;top:430px;width:720px;height:420px"></div>
<script type="module">
  const q = location.search;
  const [{ createCanvasBackend: A }, { createCanvasBackend: B }, { loadAtlases }, { compileMap }, { WORLD_MAPS }, TER, { STUB_SPRITE }, { BUILD }] = await Promise.all([
    import('/src/world/render/canvas-backend.js' + q), import('/src/world/render/canvas-backend.redraw.js' + q), import('/src/world/atlas.js' + q),
    import('/src/world/core/map-compile.js' + q), import('/src/data/world/maps/index.js' + q), import('/src/data/world/terrain.js' + q),
    import('/src/world/core/book.js' + q), import('/src/build-info.js' + q)]);
  const { book, images } = await loadAtlases({ doc: document, version: BUILD.cache });
  const sprites = new Proxy(book.sprites, { get: (t, k) => t[k] || STUB_SPRITE });
  const tables = { materials: TER.MATERIALS, sprites, openClasses: TER.OPEN_CLASSES, lights: TER.LIGHTS };
  const styles = getComputedStyle(document.body);
  const css = (n) => styles.getPropertyValue(n).trim();
  const map = compileMap(WORLD_MAPS.find((m) => m.id === '${HUNT}'), tables);
  const mk = (F, id) => { const b = F({ win: window, doc: document, book, images, tables, css }); b.mount(document.getElementById(id)); b.setMap(map); return b; };
  const a = mk(A, 'a'), b = mk(B, 'b');
  const px = (id) => { const c = document.querySelector('#' + id + ' canvas'); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; };
  const out = { frames: 0, differ: [], kept: 0 };
  let hx = 20, hy = 18, rx = 14, t = 0;
  for (let i = 0; i < 200; i++) {
    t += 50;
    if (i >= 40 && i < 80) hx += 0.05;          // the hero walks (both masks follow the view)
    if (i >= 100 && i < 140) rx += 0.1;         // a monster walks past while the hero stands
    if (i === 150) { hx = 1; hy = 1; }           // into the map's corner: the camera stops at the edge...
    if (i > 150 && i < 190) { hx += 0.04; hy += 0.02; }   // ...and the hero's lamp walks across a view that stands still
    const state = { hero: { x: hx, y: hy, anim: (i >= 40 && i < 80) || (i > 150 && i < 190) ? 'walk' : 'idle', dir: 'e' },
      units: [{ id: 'drain_rat', x: rx, y: 19, anim: i >= 100 && i < 140 ? 'walk' : 'idle', dir: 'e' }, { id: 'drain_rat', x: 23, y: 17, anim: 'idle', dir: 's' }], t };
    a.sync(state); b.sync(state);
    const pa = px('a'), pb = px('b');
    let n = 0; for (let k = 0; k < pa.length; k++) if (pa[k] !== pb[k]) n++;
    if (n) out.differ.push([i, n]);
    out.frames++;
  }
  out.kept = a.snapshot().masks;
  window.__pix = out;
</script></body></html>`;

/** PB-PIX in `browser`: the shipped backend vs one that re-draws both masks each frame, frame by frame. */
async function pixelRule(browser, extra) {
  const pw = await import('playwright');
  const H = await import('./_client-harness.mjs');
  const files = planted(extra);
  const src = files['src/world/render/canvas-backend.js'] ?? readFileSync(join(ROOT, 'src/world/render/canvas-backend.js'), 'utf8');
  const redraw = src.replace('if (sig !== shadeSig) {', 'if (true) {').replace('if (sig !== litSig) {', 'if (true) {');
  if (redraw === src || redraw.split('if (true) {').length !== 3) return ['PB-PIX harness: the mask signature checks in canvas-backend.js are not found'];
  const { server, port } = await H.serve(Object.assign({}, files, { 'perf-pix.html': PIX_PAGE, 'src/world/render/canvas-backend.redraw.js': redraw }));
  const launch = browser === 'chromium' ? (await import('./_chrome.mjs')).launchOptions({ headless: true }) : { headless: true };
  const b = await pw[browser].launch(launch);
  try {
    const page = await (await b.newContext({ viewport: { width: 760, height: 860 } })).newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('http://127.0.0.1:' + port + '/perf-pix.html?v=pix');
    await page.waitForFunction(() => window.__pix || null, null, { timeout: 60000 }).catch(() => null);
    const r = await page.evaluate(() => window.__pix || null);
    if (!r) return ['PB-PIX the page never finished: ' + errs.join(' | ')];
    console.log(`  PB-PIX ${browser}: ${r.frames} frames, masks drawn ${r.kept.shadow} shadow / ${r.kept.light} light, kept ${r.kept.kept}; ${r.differ.length} frame(s) differ`);
    const f = [];
    if (r.differ.length) f.push(`PB-PIX a kept mask painted different pixels from a re-drawn one on ${r.differ.length} frame(s) (first: frame ${r.differ[0][0]}, ${r.differ[0][1]} bytes)`);
    if (!(r.kept.kept > 0)) f.push('PB-PIX no mask was ever kept: the World re-draws both masks every frame');
    return f;
  } finally { await b.close(); server.close(); }
}

/* ── one run ── */
async function scenario(o) {
  const pw = await import('playwright');
  const engine = pw[o.browser];
  const srv = await makeServer(o.second);
  const { server, port } = await srv.H.serve(o.overrides);
  const launch = o.browser === 'chromium' ? (await import('./_chrome.mjs')).launchOptions({ headless: true }) : { headless: true };
  const browser = await engine.launch(launch);
  const D = o.minutes * 60000, HID = o.hiddenMs;
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: o.width, height: o.height } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(INIT);
    await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: srv.H.SDK_STUB }));
    await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
    await page.route('https://*.ingest.sentry.io/**', (r) => r.fulfill({ status: 204, body: '' }));
    await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
      const name = r.request().url().split('?')[0].split('/').pop();
      let args = null; try { args = r.request().postDataJSON(); } catch (e) { args = null; }
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(srv.answer(name, args)) });
    });
    const cdp = o.browser === 'chromium' ? await ctx.newCDPSession(page) : null;
    const heap = async () => { if (!cdp) return null; await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize; };
    await page.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'load' });
    await page.waitForSelector('form[data-auth="sign-in"]');
    await page.fill('input[name=email]', 'qa@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.click('.auth-submit');
    await page.waitForSelector('[data-app="play"][data-slot="0"]');
    await page.click('[data-app="play"][data-slot="0"]');
    await page.waitForSelector('.hs-launchers');
    const showAnalyzer = async () => { if (await page.$('.ha-analyzer') === null || !(await page.isVisible('.ha-analyzer'))) {
      const b = await page.$('[data-hs-act="details"]'); if (b) await b.click({ timeout: 5000 }).catch((e) => errors.push('analyzer: ' + e.message.split('\n')[0])); } };
    /* a phone shows one sheet at a time: there the analyzer is the one open (the combat log is the desktop's second window) */
    const phone = o.width <= 1024 && o.height <= 540;
    /* the combat log open on its tab (players watch it fight): its lines are the page's longest list */
    const showLog = async () => {
      if (!(await page.isVisible('.hc-chat').catch(() => false))) await page.click('[data-hs-open="chat"]').catch((e) => errors.push('chat: ' + e.message.split('\n')[0]));
      await page.click('.hc-chat [data-hs-act="tab"][data-tab="combat"]').catch(() => null);
    };
    await page.waitForTimeout(15000);   // warm-up: atlases, the first start point, both heroes open
    if (!phone) await showLog();
    await showAnalyzer();
    await page.waitForTimeout(1000);
    const w0 = await page.evaluate(() => { const P = window.__perf; P.mark('start'); P.added = 0; P.c = Object.create(null);
      return { t: performance.now(), nodes: document.getElementsByTagName('*').length, lines: document.querySelectorAll('.hc-line').length, frames: P.nf }; });
    const h0 = await heap();
    /* --snapshots DIR: a heap snapshot after each measure (start.heapsnapshot, end.heapsnapshot), to name a retainer. */
    const snap = async (name) => { if (!cdp || !o.snapshots) return; const parts = []; const on = (e) => parts.push(e.chunk);
      cdp.on('HeapProfiler.addHeapSnapshotChunk', on); await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
      cdp.off('HeapProfiler.addHeapSnapshotChunk', on); (await import('node:fs')).writeFileSync(join(o.snapshots, name + '.heapsnapshot'), parts.join('')); };
    await snap('start');
    if (cdp && o.profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
    const t0 = Date.now();
    const at = async (ms) => { const d = t0 + ms - Date.now(); if (d > 0) await page.waitForTimeout(d); };
    const tab = (slot) => page.click('.char-tab[data-slot="' + slot + '"]').catch((e) => errors.push('switch: ' + e.message.split('\n')[0]));
    await at(D * 0.15); await page.evaluate(() => window.__perf.mark('switch B')); await tab(1);
    await at(D * 0.25); await page.evaluate(() => window.__perf.mark('switch A')); await tab(0); if (!phone) await showLog(); await showAnalyzer();
    await at(D * 0.35); await page.evaluate(() => window.__perf.mark('storm')); srv.S.storm = true;
    await at(D * 0.35 + 20000); srv.S.storm = false; await page.evaluate(() => window.__perf.mark('storm end'));
    await at(D * 0.5); await page.evaluate(() => window.__perf.hide(true));
    await at(D * 0.5 + HID); await page.evaluate(() => window.__perf.hide(false));
    if (o.viewAtDeath) { await at(D * 0.7 - 3000); await tab(o.viewAtDeath); }
    await at(D * 0.7); await page.evaluate(() => { window.__perf.trackOn = true; window.__perf.mark('death'); });
    srv.deathIn(0);
    await at(D);
    if (cdp && o.profile) (await import('node:fs')).writeFileSync(o.profile, JSON.stringify((await cdp.send('Profiler.stop')).profile));
    const h1raw = await heap();
    const out = await page.evaluate(() => { const P = window.__perf; P.stopped = true;
      const got = { frames: Array.from(P.frames.slice(0, P.nf)), marks: P.marks, t: P.t, c: P.c, samples: P.samples, dom: P.dom, long: P.long, ltOk: P.ltOk, path: P.path,
        nodes: document.getElementsByTagName('*').length, added: P.added, now: performance.now() };
      /* THE PROBE'S OWN RECORDS are not the game's heap: stopped, read out, then released before the end measure
         (the post-death path alone is thousands of per-frame unit lists, megabytes the page never holds; a record
         still running between here and the measure grew it by ~60 lists a second). */
      P.marks = []; P.samples = []; P.dom = []; P.long = []; P.path = [];
      return got; });
    const h1 = await heap();
    await snap('end');
    return Object.assign(analyse(out, w0, o, srv), { heapMb: h0 === null ? null : (h1 - h0) / 1048576,
      heapRawMb: h0 === null ? null : (h1raw - h0) / 1048576, errors: errors.slice(0, 5), endedAt: srv.S.endedAt });
  } finally {
    srv.close();
    await browser.close();
    server.close();
  }
}

/* ── the numbers ── */
function analyse(out, w0, o, srv) {
  const mark = (n) => (out.marks.find((m) => m[1] === n) || [null])[0];
  const hid = mark('hidden'), shown = mark('shown');
  const fr = out.frames.filter((t) => t >= w0.t);
  /* WHAT THE PAGE CAUSED (2026-10-22, v0.2.28's CI red: a 217 ms gap while the page's own per-frame work peaked
     at 37 ms). A gap between two frames is the page's only as far as the page's main thread was busy inside it:
     the Long Tasks the browser reports (scripts, style, layout, paint, the page's own GC), clipped to the gap.
     A runner that stops the whole browser shows a wall gap with no task in it: a stall, reported, not budgeted.
     A browser without Long Tasks (Firefox in --measure) is judged on the wall gap. */
  const lts = (out.long || []).filter((l) => l[0] + l[1] >= w0.t);
  const busyIn = (a, b) => { let ms = 0; for (const [s, d] of lts) ms += Math.max(0, Math.min(b, s + d) - Math.max(a, s)); return Math.min(b - a, ms); };
  const gaps = [];
  let resumeWorst = 0, stallWorst = 0;
  for (let i = 1; i < fr.length; i++) {
    const g = fr[i] - fr[i - 1];
    /* the hidden span itself (no frame is owed) and the 2 s after it (the resume, reported apart) */
    if (hid !== null && fr[i] >= hid && fr[i - 1] <= shown + 2000) { if (fr[i - 1] >= shown) resumeWorst = Math.max(resumeWorst, g); continue; }
    const page = out.ltOk ? (g > 50 ? busyIn(fr[i - 1], fr[i]) : g) : g;
    if (g > 50 && page <= 50) stallWorst = Math.max(stallWorst, g);
    gaps.push(page);
  }
  /* fps in 1 s buckets, outside the hidden span and its resume */
  const buckets = new Map();
  for (const t of fr) { if (hid !== null && t >= hid && t <= shown + 2000) continue; const b = Math.floor((t - w0.t) / 1000); buckets.set(b, (buckets.get(b) || 0) + 1); }
  const fps = Array.from(buckets.values()).slice(1, -1).sort((a, b) => a - b);
  const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null);
  const long = gaps.filter((g) => g > 50);
  /* the page while it hunts: the last DOM sample before the party's death (the summary and town come after) */
  const dm = mark('death');
  const hunted = out.dom.filter((d) => d[0] >= w0.t && (dm === null || d[0] < dm)).pop() || null;
  const minutes = (out.now - w0.t) / 60000;
  const per = (k) => { const r = out.t[k]; return r ? { n: r.n, avg: r.ms / r.n, max: r.max, over: r.over } : null; };
  /* the analyzer: its session clock vs the hunt's real elapsed (the page and this process share the wall clock) */
  const parse = (s) => { if (!s || !/\d/.test(s)) return null; const p = s.split(':').map(Number); return p.some((x) => !Number.isFinite(x)) ? null : p.reduce((a, b) => a * 60 + b, 0) * 1000; };
  let behind = 0, backMs = 0, backs = 0, prev = null, stillMax = 0, stillFrom = null, lastKills = null;
  const deathWall = srv.S.endedAt;
  for (const [wall, perf, clk, kills] of out.samples) {
    if (perf < w0.t || (hid !== null && perf >= hid && perf <= shown + 3000)) { prev = null; continue; }
    if (deathWall !== null && wall >= deathWall - 15000) break;
    const c = parse(clk);
    if (c === null) { prev = null; continue; }
    behind = Math.max(behind, (wall - srv.start) - c);
    if (prev !== null && c < prev - 250) { backs++; backMs = Math.max(backMs, prev - c); }
    prev = c;
    if (kills !== lastKills) { lastKills = kills; stillFrom = wall; } else if (stillFrom !== null) stillMax = Math.max(stillMax, wall - stillFrom);
  }
  /* the second hero after the death: how far it walks from where the death found it, and for how long */
  let runAway = null;
  /* the hunt's end (the server's instant) on the page's clock: the samples pair the two */
  const off = out.samples.length ? out.samples[out.samples.length - 1][0] - out.samples[out.samples.length - 1][1] : 0;
  const dAt = deathWall === null ? null : deathWall - off;
  if (out.path.length && dAt !== null) {
    const heroes = new Set();
    for (const p of out.path) for (const u of p[1]) if (/^outfit_|^hero|^viewed/.test(String(u[4]))) heroes.add(u[0]);
    runAway = {};
    for (const h of heroes) {
      let from = null, far = 0, last = null, walkMs = 0, prevT = null;
      for (const [t, us] of out.path) {
        const u = us.find((x) => x[0] === h);
        if (!u || t < dAt - 3000) continue;
        if (from === null) from = [u[1], u[2]];
        far = Math.max(far, Math.hypot(u[1] - from[0], u[2] - from[1]));
        if (prevT !== null && u[3] === 'walk') walkMs += t - prevT;
        prevT = t; last = t;
      }
      runAway[h] = { tiles: +far.toFixed(1), walkMs: Math.round(walkMs), drawnUntilMs: last === null ? null : Math.round(last - dAt) };
    }
  }
  return {
    browser: o.browser, size: o.width + 'x' + o.height, minutes: +minutes.toFixed(2),
    fpsMedian: pct(fps, 0.5), fpsP5: pct(fps, 0.05), longFrames: long.length, worstFrame: gaps.length ? Math.max(...gaps) : null, resumeWorst, stallWorst, pageTimed: !!out.ltOk,
    longTasks: out.long.filter((l) => l[0] >= w0.t).length,
    engine: per('engine'), scene: per('scene'), draw: per('draw'), frame: per('frame'), envelope: per('envelope'), shellTick: per('shellTick'),
    domStart: w0.nodes, domEnd: hunted ? hunted[1] : out.nodes, domGrowth: hunted ? (hunted[1] - hunted[3]) - (w0.nodes - w0.lines) : null,
    logLines: Math.max(0, ...out.dom.map((d) => d[3])), addedPerMin: Math.round(out.added / minutes),
    paintsInAnswers: out.c.shellPaintInEnvelope || 0, drawsInAnswers: out.c.drawInEnvelope || 0, drawsOffLoop: out.c.drawOffLoop || 0,
    analyzerPerMin: Math.round((out.c.analyzer || 0) / minutes), analyzerBehindMs: Math.round(behind), analyzerBackMs: Math.round(backMs), analyzerBacks: backs, analyzerStillMs: stillMax,
    path: out.path, marks: out.marks, runAway, samples: out.samples, dom: out.dom,
  };
}

function budgetFails(m) {
  const f = [];
  const b = BUDGET;
  if (m.errors.length) f.push('page errors: ' + m.errors.join(' | '));
  if (!(m.fpsMedian >= b.fpsMedianMin)) f.push(`fps median ${m.fpsMedian} (budget >= ${b.fpsMedianMin})`);
  if (!(m.fpsP5 >= b.fpsP5Min)) f.push(`fps p5 ${m.fpsP5} (budget >= ${b.fpsP5Min})`);
  if (!(m.worstFrame <= b.longFrameMs)) f.push(`long frame: the page held a frame ${Math.round(m.worstFrame)} ms outside the hidden span (budget ${b.longFrameMs})`);
  if (!(m.longFrames <= b.longFramesMax)) f.push(`long frames: ${m.longFrames} over 50 ms (budget ${b.longFramesMax})`);
  if (m.heapMb !== null && !(m.heapMb <= b.heapGrowthMb)) f.push(`heap grew ${m.heapMb.toFixed(1)} MB (budget ${b.heapGrowthMb})`);
  if (!(m.domGrowth <= b.domGrowth)) f.push(`dom grew ${m.domGrowth} elements while hunting, the log's lines apart (budget ${b.domGrowth})`);
  if (!(m.logLines <= LOG_MAX_LINES)) f.push(`dom: the combat log shows ${m.logLines} lines (its cap is ${LOG_MAX_LINES})`);
  if (!(m.addedPerMin <= b.addedPerMin)) f.push(`dom churn: ${m.addedPerMin} nodes added per minute (budget ${b.addedPerMin})`);
  if (!(m.analyzerBehindMs <= b.analyzerBehindMs)) f.push(`analyzer clock up to ${m.analyzerBehindMs} ms behind the hunt (budget ${b.analyzerBehindMs})`);
  if (!(m.analyzerBackMs <= b.analyzerBackMs)) f.push(`analyzer clock ran back ${m.analyzerBackMs} ms (${m.analyzerBacks}x; budget ${b.analyzerBackMs})`);
  if (!(m.paintsInAnswers <= b.paintsInAnswers)) f.push(`repaint: ${m.paintsInAnswers} shell repaints inside server answers (budget ${b.paintsInAnswers})`);
  if (!(m.drawsOffLoop <= b.drawsOffLoop)) f.push(`repaint: ${m.drawsOffLoop} World draws outside the frame loop, ${m.drawsInAnswers} of them inside answers (budget ${b.drawsOffLoop})`);
  return f;
}

const ms = (r) => (r ? `${r.avg.toFixed(2)}/${r.max.toFixed(1)}` : '-');
function row(m) {
  return `${m.browser.padEnd(8)} ${m.size.padEnd(8)} fps ${m.fpsMedian}/${m.fpsP5} long ${m.longFrames} worst ${Math.round(m.worstFrame)} resume ${Math.round(m.resumeWorst)} stall ${Math.round(m.stallWorst)}${m.pageTimed ? '' : ' (wall)'} lt ${m.longTasks}`
    + ` | engine ${ms(m.engine)} scene ${ms(m.scene)} draw ${ms(m.draw)} frame ${ms(m.frame)} env ${ms(m.envelope)} (${m.envelope ? m.envelope.n : 0}) tick ${ms(m.shellTick)}`
    + ` | heap ${m.heapMb === null ? 'n/a' : m.heapMb.toFixed(1) + 'MB' + (m.heapRawMb != null ? ' (with the probe records ' + m.heapRawMb.toFixed(1) + ')' : '')} dom ${m.domStart}->${m.domEnd} (+${m.domGrowth}) log ${m.logLines} +${m.addedPerMin}/min`
    + ` | paints-in-answers ${m.paintsInAnswers} draws off-loop ${m.drawsOffLoop} (in answers ${m.drawsInAnswers})`
    + ` | analyzer ${m.analyzerPerMin}/min behind ${m.analyzerBehindMs} back ${m.analyzerBackMs}x${m.analyzerBacks} still ${m.analyzerStillMs}`;
}

function arg(name, dv) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dv; }

async function main() {
  if (process.argv.includes('--mutate')) {
    let escaped = 0;
    const only = arg('--only', null);   // a name fragment: prove just those mutants (a local re-check)
    const chosen = MUTANTS.filter((mt) => !only || mt[0].includes(only));
    for (const mt of chosen) {
      const fails = mt[5] === 'pix' ? await pixelRule('chromium', [mt])
        : budgetFails(await scenario({ browser: 'chromium', width: 1440, height: 900, minutes: mt[6] || 2, hiddenMs: 20000, overrides: planted([mt]) }));
      const hit = fails.some((x) => mt[4].test(x));
      console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${mt[0]} :: ${fails.join(' | ') || 'green'}`);
      if (!hit) escaped++;
    }
    console.log(escaped ? `perf-budget --mutate: ${escaped} mutant(s) ESCAPED` : `perf-budget --mutate: ${chosen.length}/${chosen.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  if (process.argv.includes('--measure')) {
    const minutes = Number(arg('--minutes', '10'));
    const browsers = arg('--browsers', 'chromium,firefox').split(',');
    const sizes = arg('--sizes', '1440x900,922x423').split(',').map((s) => s.split('x').map(Number));
    const dump = arg('--dump', null);
    const all = [];
    for (const browser of browsers) for (const [width, height] of sizes) {
      const m = await scenario({ browser, width, height, minutes, hiddenMs: 60000, overrides: planted() });
      all.push(m);
      console.log(row(m));
      if (m.errors.length) console.log('   errors: ' + m.errors.join(' | '));
    }
    if (dump) (await import('node:fs')).writeFileSync(dump, JSON.stringify(all));
    process.exit(0);
  }
  const browser = arg('--browser', 'chromium');
  const pix = await pixelRule(browser);
  if (process.argv.includes('--pix')) { for (const f of pix) console.log('  ✗ ' + f); process.exit(pix.length ? 1 : 0); }
  const m = await scenario({ browser, width: 1440, height: 900, minutes: Number(arg('--minutes', '4')), hiddenMs: 30000, overrides: planted(), profile: arg('--profile', null), snapshots: arg('--snapshots', null),
    second: arg('--second', 'melee_dps'), viewAtDeath: Number(arg('--view-death', '0')) });
  console.log(row(m));
  if (arg('--dump', null)) (await import('node:fs')).writeFileSync(arg('--dump', null), JSON.stringify(m));
  const fails = pix.concat(budgetFails(m));
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? `perf-budget: ${fails.length} budget(s) RED` : 'perf-budget: the hunt page holds its frame, heap, DOM and analyzer budget (Sewer party, density 8, switch, alerts, hidden tab, death)');
  process.exit(fails.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
