#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/qa/long-session.local.mjs — A TAB LEFT OPEN FOR AN HOUR: DOES IT STAY FLAT?
//
// Every earlier performance measure is a first-minute one (boot, reload, first frame). This one watches the real play.html
// on tools/qa/local-world.mjs (the replayed chain, the real engine, the real 10 s world tick; no production, no secrets)
// for a long session and samples, every --every seconds, after a forced GC:
//   heap used/total (CDP Performance.getMetrics), DOM nodes (CDP: attached AND detached) and attached elements, JS event
//   listeners (CDP), live timeouts and intervals (an init script wraps them; intervals and the busiest timeout sites are
//   named), rAF callbacks a frame (a leaked render loop doubles it), open WebSockets and joined Realtime topics, long tasks,
//   fps p50/p95 from a rAF probe, in-flight fetches and every ask by kind, live canvases and their pixels, and where the
//   DOM's elements sit (per window / widget).
// Phases: WATCH (--watch minutes; a party of --heroes own heroes hunts, the viewed one watched, `skip` ages the hunt each
// sample so settles and events keep flowing; an ended hunt is entered again) -> CHURN (--switches hero switches, then every
// window opened and closed --opens times, the Monster page included) -> CYCLES (--cycles times: the party leaves, the end
// shows, the leader's Enter on this page starts it again) -> SECOND TAB (--second-tab minutes: the same account opened in
// another tab, both visible) -> HIDDEN (--hidden minutes: the page reports hidden and gets no animation frames, as a
// background tab; asks counted, then shown: does the hunt view resume, and how long to the first fresh frame) -> FROZEN
// (--frozen minutes: Page.setWebLifecycleState frozen, Chrome's own background-tab freeze; then active: the same questions).
// --retainers: after the churn and the cycles, every kind of detached DOM node still alive, with one strong chain from a GC
// root (a heap snapshot). --snap-at N: what grew in the heap, by kind, between watch minute N and the watch's end, and
// between hunt cycle 5 and the last. Every answer >= 400 the page got is listed with its body.
//
//   node tools/qa/long-session.local.mjs [--watch 40] [--every 60] [--heroes 4] [--skip 2] [--switches 10] [--opens 20]
//        [--cycles 10] [--second-tab 0] [--hidden 15] [--frozen 5] [--retainers] [--snap-at N] [--out FILE.json]
// Exit 0: every phase ran (a verdict on growth is read from the table it prints, not an exit code); 2 harness.
// HEADLESS LIMITS: the page cannot be truly backgrounded headless (a second tab leaves it "visible", measured 11-11), so
// HIDDEN is emulated in the page (visibilityState + no rAF), and Playwright's launch disables Chrome's timer throttling.
// The harness holds no element handle (see `seen`): one it kept alive read as 2,100 leaked nodes per window round.
// Its own Network domain (page.on('response')) keeps DevTools resource data: ~10 KB a hunt cycle of heap that is not the page's.
// First report: .claude/coordination/client-health-2026-11-11.md. One browser, one world: run it alone (tools/pc-load.local.mjs first).
// mutant-anchors: none — a manual measuring tool, not a CI guard
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { openWorld } from './local-world.mjs';

const arg = (name, d) => { const i = process.argv.indexOf(name); return i < 0 ? d : (typeof d === 'number' ? Number(process.argv[i + 1]) : process.argv[i + 1]); };
const O = { watch: arg('--watch', 40), every: arg('--every', 60), heroes: arg('--heroes', 4), skip: arg('--skip', 2), switches: arg('--switches', 10),
  opens: arg('--opens', 20), hidden: arg('--hidden', 15), frozen: arg('--frozen', 5), cycles: arg('--cycles', 10), tab2: arg('--second-tab', 0), out: arg('--out', ''), snapAt: arg('--snap-at', 0), retainers: process.argv.includes('--retainers'), hunt: arg('--hunt', 'mill_cellar') };
const PASSWORD = 'local-world-password';   // local-world's own throwaway: the account dies with the process
const t0 = Date.now();
const say = (s) => console.log('[' + String(Math.round((Date.now() - t0) / 1000)).padStart(5) + ' s] ' + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* Wait for a selector WITHOUT an element handle: page.waitForSelector answers one, and a handle the harness never disposes keeps
   its whole tree alive after the page lets it go (a switched-from pane, a closed window): it reads exactly like the leak this measures. */
const seen = (sel, o = {}) => p.page.locator(sel).first().waitFor({ state: 'attached', timeout: o.timeout || 120000 });

/* ── THE PAGE'S INSTRUMENTS (an init script: in place before any of the page's own code) ─────────────────── */
const INSTRUMENTS = String.raw`(() => {
  const H = window.__lh = { hidden: false, created: { t: 0, i: 0 }, asks: {}, inflight: 0, raf: 0, frames: [], long: { n: 0, ms: 0 },
    ws: { open: 0, made: 0, rx: 0 }, topics: new Set(), canvases: [], bitmaps: [], rafSites: {}, frameN: 0 };
  const site = () => {
    const s = String(new Error().stack || '').split('\n');
    for (let i = 1; i < s.length; i++) if (!s[i].includes('__lh.js')) return s[i].trim().replace(/^at /, '').replace(location.origin, '').replace(/\?v=[0-9.]+/, '');
    return '?';
  };
  const oST = window.setTimeout, oCT = window.clearTimeout, oSI = window.setInterval, oCI = window.clearInterval, oRAF = window.requestAnimationFrame.bind(window);
  const live = H.live = new Map();
  window.setTimeout = function (fn, ms, ...a) {
    const s = site(); let id;
    id = oST.call(window, function () { live.delete(id); return typeof fn === 'function' ? fn.apply(this, a) : undefined; }, ms);
    live.set(id, { k: 't', s, ms: Number(ms) || 0 }); H.created.t++; return id;
  };
  window.setInterval = function (fn, ms, ...a) {
    const id = oSI.call(window, typeof fn === 'function' ? function () { return fn.apply(this, a); } : fn, ms);
    live.set(id, { k: 'i', s: site(), ms: Number(ms) || 0 }); H.created.i++; return id;
  };
  window.clearTimeout = function (id) { live.delete(id); return oCT.call(window, id); };
  window.clearInterval = function (id) { live.delete(id); return oCI.call(window, id); };
  /* A hidden page gets no animation frames (as a background tab): callbacks wait for the page to be shown. */
  const held = [];
  window.requestAnimationFrame = function (cb) { H.raf++; if ((H.raf & 63) === 0) { const k = site(); H.rafSites[k] = (H.rafSites[k] || 0) + 1; } if (H.hidden) { held.push(cb); return -1; } return oRAF(cb); };
  H.show = () => { H.hidden = false; document.dispatchEvent(new Event('visibilitychange')); const q = held.splice(0); for (const cb of q) oRAF(cb); };
  H.hide = () => { H.hidden = true; document.dispatchEvent(new Event('visibilitychange')); };
  const vis = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
  const hid = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return H.hidden ? 'hidden' : vis.get.call(this); } });
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return H.hidden ? true : hid.get.call(this); } });
  /* fps: our own frame loop on the page's real rAF (not counted in H.raf) */
  let last = 0;
  const frame = (now) => { if (last) { H.frameN++; H.frames.push(now - last); if (H.frames.length > 4000) H.frames.splice(0, 1000); } last = now; if (H.hidden) { last = 0; held.push(frame); } else oRAF(frame); };
  oRAF(frame);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { H.long.n++; H.long.ms += e.duration; } }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  const kindOf = (u) => { const m = /\/rest\/v1\/rpc\/([a-z_0-9]+)/.exec(u); if (m) return m[1]; if (u.includes('/functions/v1/hr-accrue')) return 'hr-accrue'; if (u.includes('/auth/v1/')) return 'auth'; return 'file'; };
  const oFetch = window.fetch;
  window.fetch = function (input, init) {
    const u = String(input && input.url || input); const k = kindOf(u);
    H.asks[k] = (H.asks[k] || 0) + 1; H.inflight++;
    return oFetch.call(window, input, init).finally(() => { H.inflight--; });
  };
  const OWS = window.WebSocket;
  window.WebSocket = class extends OWS {
    constructor(...a) {
      super(...a); H.ws.made++;
      this.addEventListener('open', () => { H.ws.open++; });
      this.addEventListener('close', () => { H.ws.open--; });
      this.addEventListener('message', () => { H.ws.rx++; });
    }
    send(d) {
      try { const m = JSON.parse(d); const ev = Array.isArray(m) ? m[3] : m.event; const topic = Array.isArray(m) ? m[2] : m.topic;
        if (ev === 'phx_join') H.topics.add(topic); else if (ev === 'phx_leave') H.topics.delete(topic); } catch (e) {}
      return super.send(d);
    }
  };
  const oCreate = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, o) { const el = oCreate.call(this, tag, o); if (String(tag).toLowerCase() === 'canvas') H.canvases.push(new WeakRef(el)); return el; };
  if (window.OffscreenCanvas) { const OC = window.OffscreenCanvas; window.OffscreenCanvas = class extends OC { constructor(...a) { super(...a); H.canvases.push(new WeakRef(this)); } }; }
  if (window.createImageBitmap) { const oCIB = window.createImageBitmap; window.createImageBitmap = function (...a) { return oCIB.apply(window, a).then((b) => { H.bitmaps.push(new WeakRef(b)); return b; }); }; }
  H.snap = () => {
    const f = H.frames.splice(0).sort((a, b) => a - b); const frameN = H.frameN; H.frameN = 0;
    const pick = (q) => f.length ? Math.round(f[Math.min(f.length - 1, Math.floor(f.length * q))] * 10) / 10 : null;
    const timers = { t: 0, i: 0 }, sites = {}, ivs = {};
    for (const x of live.values()) { timers[x.k]++; const key = x.s; if (x.k === 'i') ivs[key] = (ivs[key] || 0) + 1; else sites[key] = (sites[key] || 0) + 1; }
    H.canvases = H.canvases.filter((w) => w.deref()); H.bitmaps = H.bitmaps.filter((w) => w.deref() && w.deref().width);
    let px = 0, inDom = 0; for (const w of H.canvases) { const c = w.deref(); px += (c.width || 0) * (c.height || 0); if (c.isConnected) inDom++; }
    let bpx = 0; for (const w of H.bitmaps) { const b = w.deref(); bpx += b.width * b.height; }
    const regions = {};
    for (const el of document.querySelectorAll('[data-hs-win], [data-hs-widget], #panel-world, nav.char-strip, body > *')) {
      const k = el.getAttribute('data-hs-win') ? 'win:' + el.getAttribute('data-hs-win') : el.getAttribute('data-hs-widget') ? 'w:' + el.getAttribute('data-hs-widget') : el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0];
      regions[k] = (regions[k] || 0) + el.getElementsByTagName('*').length;
    }
    const raf = H.raf; H.raf = 0; const rafSites = Object.entries(H.rafSites).sort((a, b) => b[1] - a[1]).slice(0, 4); H.rafSites = {};
    return { elements: document.getElementsByTagName('*').length, timers, ivs, topTimeouts: Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, 6),
      rafCalls: raf, rafSites, frames: frameN, fpsP50: f.length ? Math.round(1000 / pick(0.5)) : 0, frameP95: pick(0.95), long: { ...H.long }, asks: { ...H.asks }, inflight: H.inflight,
      ws: { ...H.ws }, topics: [...H.topics], canvases: H.canvases.length, canvasesInDom: inDom, canvasMpx: Math.round(px / 1e4) / 100, bitmaps: H.bitmaps.length, bitmapMpx: Math.round(bpx / 1e4) / 100,
      regions: Object.fromEntries(Object.entries(regions).sort((a, b) => b[1] - a[1]).slice(0, 10)),
      leave: !!document.querySelector('[data-hs-act="leave"]'), wins: document.querySelectorAll('[data-hs-win]').length };
  };
  /* A cheap picture hash of the world canvas, for "the first fresh frame" after the page is shown again. */
  H.picture = () => { const cv = document.querySelector('#panel-world canvas, canvas.world-canvas'); if (!cv) return null;
    const o = H._off || (H._off = Object.assign(oCreate.call(document, 'canvas'), { width: 96, height: 54 })); const x = o.getContext('2d', { willReadFrequently: true });
    x.drawImage(cv, 0, 0, 96, 54); const d = x.getImageData(0, 0, 96, 54).data; let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) | 0; return h; };
})();
//# sourceURL=__lh.js
`;

/* ── THE WORLD, THE ACCOUNT, THE PARTY ─────────────────────────────────────── */
const world = await openWorld({ tickMs: 10000 });
say('world up ' + world.url);
const q = async (sql, p) => (await world.db.query(sql, p)).rows;
const post = async (path, body, token) => {
  const res = await fetch(world.origin + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const samples = [], notes = [], refused = new Map();
let p, cdp, uid, token;
const rpc = async (fn, args) => (await post('/rest/v1/rpc/' + fn, args, token)).body;
const fresh = () => q('delete from public.hr_rate_counters where user_id = $1', [uid]);

async function sample(phase, extra = {}) {
  /* three collections (tests/perf-budget.mjs PB-LEAK): one leaves detached trees a weak edge still held */
  for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); await sleep(200); }
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  const dom = await cdp.send('Memory.getDOMCounters').catch(() => ({}));
  const s = await p.page.evaluate(() => window.__lh.snap());
  const open = await q('select slot, hunt_id from public.hunt_sessions where user_id = $1 and ended_at is null order by slot', [uid]);
  const row = { phase, at: Math.round((Date.now() - t0) / 1000), heapMB: Math.round(m.JSHeapUsedSize / 1e5) / 10, heapTotalMB: Math.round(m.JSHeapTotalSize / 1e5) / 10,
    nodes: dom.nodes ?? m.Nodes, listeners: dom.jsEventListeners ?? m.JSEventListeners, documents: dom.documents ?? m.Documents, ...s, openHunts: open.length, ...extra };
  samples.push(row);
  say(`${phase.padEnd(7)} heap ${row.heapMB}/${row.heapTotalMB} MB  nodes ${row.nodes} (el ${row.elements})  listeners ${row.listeners}  timers t${row.timers.t}/i${row.timers.i}  raf/frame ${row.frames ? (row.rafCalls / row.frames).toFixed(2) : '-'}  fps ${row.fpsP50} p95 ${row.frameP95} ms  long ${row.long.n}  ws ${row.ws.open} topics ${row.topics.length}  canvases ${row.canvases} (${row.canvasMpx} Mpx)  hunts ${row.openHunts}  leave ${row.leave}`);
  return row;
}

async function closeAll() {
  for (let i = 0; i < 5 && await p.page.evaluate(() => document.querySelectorAll('[data-hs-win]:not(.is-leaving)').length > 0); i++) {
    await p.page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    await p.page.keyboard.press('Escape');
    await sleep(200);
  }
  /* Escape on an empty screen opens Settings (its key): close it again */
  if (await p.page.evaluate(() => !!document.querySelector('[data-hs-win="settings"]'))) { await p.page.keyboard.press('Escape'); await sleep(200); }
}

/** The party hunts again if it stopped (stamina, supplies, a death): the leader's Start, the real verb. */
async function huntOn() {
  const open = await q('select count(*)::int as n from public.hunt_sessions where user_id = $1 and ended_at is null', [uid]);
  if (open[0].n > 0) return false;
  await fresh();
  await q('update public.player_state set stamina_ms = 43200000, stamina_at = now() where user_id = $1', [uid]);   // a LOCAL fixture: this in-memory world only
  const r = O.heroes > 1 ? await rpc('hr_hunt_party_start', { p_slot: 0, p_hunt: O.hunt, p_idem: randomUUID() }) : null;
  if (O.heroes > 1 && (!r || r.ok !== true)) notes.push('party start refused: ' + JSON.stringify(r).slice(0, 200));
  if (O.heroes <= 1) { await closeAll(); await p.enterHunt(O.hunt); }
  return true;
}

try {
  p = await world.play({ account: 'longsession', viewport: { width: 1280, height: 720 } });
  await p.createHero('Lumen');
  const login = await post('/auth/v1/token?grant_type=password', { email: p.email, password: PASSWORD });
  token = login.body.access_token; uid = login.body.user.id;
  for (let s = 1; s < O.heroes; s++) {
    const hero = () => rpc('hr_create_hero', { p_slot: s, p_name: 'Lumen' + 'ABC'[s - 1], p_colors: { head: 0, body: 0, legs: 0, feet: 0 }, p_idem: randomUUID() });
    let r = await hero();
    if (!r || r.ok !== true) {   // a LOCAL fixture purse for the slot (this in-memory world only)
      await q(`insert into public.account_wallet (user_id, gold) values ($1, 100000000) on conflict (user_id) do update set gold = 100000000`, [uid]);
      await rpc('hr_buy_hero_slot', { p_slot_id: s, p_slot: 0, p_idem: randomUUID() }); r = await hero();
    }
    if (!r || r.ok !== true) throw new Error('hero ' + s + ': ' + JSON.stringify(r));
    await fresh();
  }
  for (let s = 1; s < O.heroes; s++) { const r = await rpc('hr_hunt_party_invite_own', { p_slot: 0, p_other_slot: s, p_idem: randomUUID() }); if (!r || r.ok !== true) notes.push('invite ' + s + ': ' + JSON.stringify(r).slice(0, 160)); await fresh(); }
  /* The instruments go in, then a reload boots the page under them; every hero is opened from the Characters screen. */
  await p.page.context().addInitScript({ content: INSTRUMENTS });
  p.page.on('response', async (r) => {
    if (r.status() < 400) return;
    const k = r.request().method() + ' ' + new URL(r.url()).pathname + ' ' + r.status();
    const had = refused.get(k);
    if (had) { had.n++; return; }
    const row = { n: 1, at: Math.round((Date.now() - t0) / 1000), body: '' };
    refused.set(k, row);
    row.body = (await r.text().catch(() => '')).slice(0, 200);
  });
  await p.reload();
  cdp = await p.page.context().newCDPSession(p.page);
  await cdp.send('Performance.enable');
  await seen('.char-tab[data-app="show"][data-slot="0"]');
  for (let s = 1; s < O.heroes; s++) {
    if (await p.page.locator('.char-tab[data-app="show"][data-slot="' + s + '"]').count()) continue;   // a reload reopens the heroes already open (sessionStorage hr-open)
    await p.page.click('[data-app="characters"]');
    await seen('[data-app="play"][data-slot="' + s + '"]');
    await p.page.click('[data-app="play"][data-slot="' + s + '"]');
    await seen('.char-tab[data-app="show"][data-slot="' + s + '"]');
  }
  await p.page.click('.char-tab[data-app="show"][data-slot="0"]');
  await sleep(1500);
  if (O.heroes > 1) await huntOn(); else await p.enterHunt(O.hunt);
  await seen('[data-hs-act="leave"]', { timeout: 120000 });
  say('party of ' + O.heroes + ' hunting ' + O.hunt + '; watching ' + O.watch + ' min');
  await sleep(20000);
  await sample('start');

  /* ── WATCH ── */
  let restarts = 0, heapA = null;
  for (let m = 1; m <= O.watch * 60 / O.every; m++) {
    await sleep(O.every * 1000 - 1500);
    if (O.skip > 0) { await world.skip(O.skip).catch((e) => notes.push('skip: ' + e.message)); await fresh(); }
    if (await huntOn()) { restarts++; await sleep(5000); }
    await sample('watch', { restarts });
    /* --snap-at N: a heap snapshot after N watch minutes and another at the end of the watch; what grew between them, by constructor */
    if (O.snapAt && m * O.every === O.snapAt * 60) heapA = await heapSummary();
    if (O.snapAt && heapA && m === O.watch * 60 / O.every) notes.push('heap grew between minute ' + O.snapAt + ' and ' + O.watch + ' of the watch:\n    ' + heapDiff(heapA, await heapSummary()).join('\n    '));
  }

  /* ── CHURN: hero switches, then every window ── */
  for (let i = 0; i < O.switches; i++) {
    await p.page.click('.char-tab[data-app="show"][data-slot="1"]'); await sleep(1500);
    await p.page.click('.char-tab[data-app="show"][data-slot="0"]'); await sleep(1500);
    if (i + 1 === Math.ceil(O.switches / 2)) await sample('switch', { switches: i + 1 });
  }
  await sample('switch', { switches: O.switches });
  const WINS = [['h', 'hunts'], ['b', 'inventory'], ['c', 'character'], ['g', 'skills-trade'], ['m', 'market']];
  let monster = 0;
  for (let i = 0; i < O.opens; i++) {
    for (const [key, id] of WINS) {
      await closeAll();
      await p.page.keyboard.press(key);
      await seen('[data-hs-win="' + id + '"]', { timeout: 5000 }).catch(() => notes.push('window ' + id + ' did not open (round ' + i + ')'));
      await sleep(250);
    }
    /* the Monster page: Hunts -> the ground -> a creature's link */
    await closeAll();
    await p.page.keyboard.press('h');
    await seen('[data-hs-win="hunts"]', { timeout: 5000 }).catch(() => {});
    await p.page.click('.hw-hunt[data-hunt="' + O.hunt + '"]').catch(() => {});
    const link = p.page.locator('[data-hs-win="hunts"] [data-hs-goto^="monster|"]').first();
    if (await link.count()) { await link.click().catch(() => {}); if (await seen('[data-hs-win="monster"]', { timeout: 3000 }).then(() => true, () => false)) monster++; }
    await sleep(250);
    if ((i + 1) % 5 === 0 && i + 1 < O.opens) { await closeAll(); await sample('windows', { opens: i + 1, monsterOpened: monster }); }
  }
  await closeAll();
  if (!monster && O.opens > 0) notes.push('the Monster page never opened from the Hunts window');
  await sleep(5000);
  await sample('windows', { opens: O.opens, monsterOpened: monster });
  /* --retainers: what still holds a detached DOM tree after the churn (one chain per kind of detached root, up to 6) */
  if (O.retainers) notes.push('detached DOM after the churn:\n    ' + (await detachedRetainers()).join('\n    '));

  /* ── HUNT CYCLES: the party leaves, the hunt ends on screen (summary, alerts), the party goes in again ── */
  if (O.cycles > 0) {
    const relog = await post('/auth/v1/token?grant_type=password', { email: p.email, password: PASSWORD });   // the harness's own token lives an hour
    token = relog.body.access_token;
    let heapC = null;
    for (let c = 1; c <= O.cycles; c++) {
      for (const o of await q('select slot from public.hunt_sessions where user_id = $1 and ended_at is null', [uid])) { await fresh(); await rpc('hr_hunt_leave', { p_slot: o.slot, p_idem: randomUUID() }); }
      for (let i = 0; i < 60 && (await q('select 1 from public.hunt_sessions where user_id = $1 and ended_at is null', [uid])).length; i++) { await sleep(1000); await world.tick().catch(() => {}); }
      await sleep(4000);   // the page hears the end: the summary, the alerts
      await closeAll();
      /* The leader's Enter on THIS page (Hunts -> the ground -> Enter): a Start from outside the page shows here only at the
         world tick's first flush settle (90 s), since the server nudges no own hero (2027-02-11-party-nudge.sql §1; DISCOVERIES). */
      await fresh();
      await q('update public.player_state set stamina_ms = 43200000, stamina_at = now() where user_id = $1', [uid]);   // a LOCAL fixture: this in-memory world only
      await p.page.keyboard.press('h');
      await seen('[data-hs-win="hunts"]', { timeout: 10000 }).catch(() => {});
      await p.page.click('.hw-hunt[data-hunt="' + O.hunt + '"]').catch(() => {});
      await p.page.click('.hw-hunt-enter').catch(() => {});
      await seen('[data-hs-act="leave"]', { timeout: 60000 }).catch(async () => notes.push('cycle ' + c + ': the hunt view did not come back. Server: '
        + JSON.stringify(await q('select slot, hunt_id from public.hunt_sessions where user_id = $1 and ended_at is null order by slot', [uid]))
        + ' Page: ' + JSON.stringify(await p.page.evaluate(() => ({ viewed: (document.querySelector('.char-tab.is-shown') || {}).getAttribute?.('data-slot'),
          wins: Array.from(document.querySelectorAll('[data-hs-win]')).map((w) => w.getAttribute('data-hs-win')),
          tabs: Array.from(document.querySelectorAll('.char-tab-doing')).map((e) => e.textContent), text: document.body.innerText.slice(0, 300) })))));
      await sleep(8000);
      if (c % 5 === 0 || c === O.cycles) await sample('cycles', { cycles: c });
      /* --snap-at with cycles: a heap snapshot after the 5th cycle and after the last; what grew between them */
      if (O.snapAt && c === 5) heapC = await heapSummary();
      if (O.snapAt && heapC && c === O.cycles) notes.push('heap grew between hunt cycle 5 and ' + c + ':\n    ' + heapDiff(heapC, await heapSummary()).join('\n    '));
    }
    if (O.retainers) notes.push('detached DOM after the hunt cycles:\n    ' + (await detachedRetainers()).join('\n    '));
  }

  /* ── A SECOND TAB on the same account (the QA habit "open a fresh tab"): both visible, the same hero viewed in each ── */
  if (O.tab2 > 0) {
    const page2 = await p.page.context().newPage();
    const r2 = new Map();
    page2.on('response', async (r) => { if (r.status() < 400) return; const b = (await r.text().catch(() => '')).slice(0, 120); const k = r.status() + ' ' + new URL(r.url()).pathname + ' ' + b; r2.set(k, (r2.get(k) || 0) + 1); });
    const before1 = new Map([...refused].map(([k, r]) => [k, r.n]));
    const asks1 = { ...(await p.page.evaluate(() => window.__lh.asks)) };
    await page2.goto(world.url, { waitUntil: 'load' });
    const open2 = await page2.locator('[data-app="play"][data-slot="0"], .char-tab[data-slot="0"]').first().waitFor({ timeout: 120000 }).then(() => true, () => false);
    if (await page2.locator('[data-app="play"][data-slot="0"]').count()) await page2.locator('[data-app="play"][data-slot="0"]').click();
    say('second tab open on hero 0 (' + open2 + '); both visible for ' + O.tab2 + ' min');
    for (let m = 1; m <= O.tab2; m++) { await sleep(60000); if (O.skip > 0) { await world.skip(O.skip).catch(() => {}); await fresh(); } }
    const alive1 = await resume(async () => {});
    const tab1Refused = [...refused].map(([k, r]) => [k, r.n - (before1.get(k) || 0)]).filter(([, n]) => n > 0);
    await sample('tab2', { tab2Min: O.tab2, asksTab1: diff(await p.page.evaluate(() => window.__lh.asks), asks1), tab1Refused, tab2Refused: [...r2], tab1Alive: alive1 });
    await page2.close();
  }

  /* ── HIDDEN ── */
  if (O.hidden > 0) {
  const asksBefore = { ...(await p.page.evaluate(() => window.__lh.asks)) };
  const rxBefore = await p.page.evaluate(() => window.__lh.ws.rx);
  await p.page.evaluate(() => window.__lh.hide());
  say('page hidden for ' + O.hidden + ' min');
  for (let m = 1; m <= O.hidden; m++) {
    await sleep(60000 - 800);
    if (O.skip > 0) { await world.skip(O.skip).catch((e) => notes.push('skip(hidden): ' + e.message)); await fresh(); }
    await huntOn();
  }
  const asksHidden = diff(await p.page.evaluate(() => window.__lh.asks), asksBefore);
  const rxHidden = (await p.page.evaluate(() => window.__lh.ws.rx)) - rxBefore;
  /* the browser-pane probe (tools/qa/pane-probe.js) on the hidden page: it must answer at once, not wait for frames that never come */
  const probeHidden = await probe(3);
  const back = await resume(() => p.page.evaluate(() => window.__lh.show()));
  const probeShown = await probe(3);
  if (!/hidden/.test(String(probeHidden.error)) || probeHidden.ms > 2000) notes.push('pane-probe on the hidden page: ' + JSON.stringify(probeHidden));
  await sample('hidden', { hiddenMin: O.hidden, asksWhileHidden: asksHidden, framesPushedWhileHidden: rxHidden, resume: back, probeHidden, probeShown });
  }

  /* ── FROZEN (Chrome's own freeze of a background tab) ── */
  if (O.frozen > 0) {
    const fa = { ...(await p.page.evaluate(() => window.__lh.asks)) };
    await p.page.evaluate(() => window.__lh.hide());
    await sleep(16000);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    say('page frozen for ' + O.frozen + ' min');
    for (let m = 1; m <= O.frozen; m++) { await sleep(60000); if (O.skip > 0) { await world.skip(O.skip).catch(() => {}); await fresh(); } await huntOn(); }
    const thawed = await resume(async () => { await cdp.send('Page.setWebLifecycleState', { state: 'active' }); await p.page.evaluate(() => window.__lh.show()); });
    await sample('frozen', { frozenMin: O.frozen, asksAcrossFreeze: diff(await p.page.evaluate(() => window.__lh.asks), fa), resume: thawed });
  }
} catch (e) {
  notes.push('HARNESS: ' + (e && e.stack || e));
  if (p) notes.push('page at failure: ' + JSON.stringify(await p.page.evaluate(() => ({ tabs: Array.from(document.querySelectorAll('.char-tab')).map((b) => b.getAttribute('data-slot')), text: document.body.innerText.slice(0, 500) })).catch((x) => String(x))));
  console.error(e);
} finally {
  const out = { options: O, notes, refused: Object.fromEntries(refused), errors: p ? p.errors.slice(0, 40) : [], samples };
  if (O.out) writeFileSync(O.out, JSON.stringify(out, null, 1));
  console.log('\n' + table(samples));
  if (refused.size) console.log('answers >= 400:\n  ' + [...refused].map(([k, r]) => k + ' x' + r.n + ' (first at ' + r.at + ' s) ' + r.body).join('\n  '));
  if (notes.length) console.log('notes:\n  ' + notes.join('\n  '));
  if (p && p.errors.length) console.log('page errors (' + p.errors.length + '):\n  ' + p.errors.slice(0, 10).join('\n  '));
  await world.close();
  process.exit(notes.some((n) => n.startsWith('HARNESS')) ? 2 : 0);
}

/** A heap snapshot (after three collections) as { 'type:name': [count, selfBytes] }. */
async function snapshot() {
  for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage'); await sleep(200); }
  let raw = '';
  const onChunk = (e) => { raw += e.chunk; };
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  return JSON.parse(raw);
}
/** For each kind of detached DOM node, the count, and one shortest chain of strong references from a GC root to one of them. */
async function detachedRetainers() {
  const snap = await snapshot();
  const m = snap.snapshot.meta, N = m.node_fields.length, E = m.edge_fields.length;
  const nt = m.node_types[0], et = m.edge_types[0];
  const iT = m.node_fields.indexOf('type'), iN = m.node_fields.indexOf('name'), iC = m.node_fields.indexOf('edge_count'), iD = m.node_fields.indexOf('detachedness');
  const eT = m.edge_fields.indexOf('type'), eN = m.edge_fields.indexOf('name_or_index'), eTo = m.edge_fields.indexOf('to_node');
  const count = snap.nodes.length / N;
  const name = (n) => String(snap.strings[snap.nodes[n * N + iN]]);
  const rev = Array.from({ length: count }, () => []);
  for (let n = 0, e = 0; n < count; n++) {
    for (let k = snap.nodes[n * N + iC]; k > 0; k--, e += E) {
      const type = et[snap.edges[e + eT]];
      if (type === 'weak' || type === 'shortcut') continue;
      const to = snap.edges[e + eTo] / N;
      const label = type === 'element' || type === 'hidden' ? '[' + snap.edges[e + eN] + ']' : String(snap.strings[snap.edges[e + eN]]);
      rev[to].push([n, label]);
    }
  }
  const kinds = new Map();
  for (let n = 0; n < count; n++) {
    const detached = iD >= 0 ? snap.nodes[n * N + iD] === 2 : name(n).startsWith('Detached ');
    if (!detached || nt[snap.nodes[n * N + iT]] !== 'object') continue;
    const k = name(n).replace(/^Detached /, '').split(' ')[0];
    const r = kinds.get(k) || { n: 0, one: n };
    r.n++; kinds.set(k, r);
  }
  const out = [];
  for (const [k, r] of [...kinds].sort((a, b) => b[1].n - a[1].n).slice(0, 6)) {
    /* breadth-first up the reverse edges to the first GC root */
    const prev = new Map([[r.one, null]]);
    let q = [r.one], root = null;
    while (q.length && root === null) {
      const next = [];
      for (const n of q) {
        if (nt[snap.nodes[n * N + iT]] === 'synthetic') { root = n; break; }
        for (const [from, label] of rev[n]) if (!prev.has(from)) { prev.set(from, [n, label]); next.push(from); }
      }
      q = next;
    }
    const chain = [];
    for (let n = root; n !== null && prev.get(n);) { const [to, label] = prev.get(n); chain.push(name(n).slice(0, 50) + ' .' + label); n = to; }
    out.push(k + ' x' + r.n + ': ' + (root === null ? '(no root found)' : chain.slice(-10).join(' -> ')));
  }
  return out.length ? out : ['none'];
}
async function heapSummary() {
  for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage'); await sleep(200); }
  let raw = '';
  const onChunk = (e) => { raw += e.chunk; };
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  const snap = JSON.parse(raw);
  const f = snap.snapshot.meta.node_fields, types = snap.snapshot.meta.node_types[0], N = f.length;
  const it = f.indexOf('type'), iname = f.indexOf('name'), isz = f.indexOf('self_size');
  const out = {};
  for (let i = 0; i < snap.nodes.length; i += N) {
    const type = types[snap.nodes[i + it]];
    const name = type === 'string' || type === 'concatenated string' || type === 'sliced string' ? '(string)' : type === 'number' ? '(number)' : String(snap.strings[snap.nodes[i + iname]]).slice(0, 80);
    const k = type + ':' + name;
    const r = out[k] || (out[k] = [0, 0]);
    r[0]++; r[1] += snap.nodes[i + isz];
  }
  return out;
}
/** The 20 kinds that grew most in bytes between two summaries, and how many more of each. */
function heapDiff(a, b) {
  return Object.keys(b).map((k) => [k, b[k][0] - (a[k] ? a[k][0] : 0), b[k][1] - (a[k] ? a[k][1] : 0)])
    .filter((r) => r[2] > 0).sort((x, y) => y[2] - x[2]).slice(0, 20).map(([k, n, by]) => k + '  +' + n + ' (' + Math.round(by / 1024) + ' KB)');
}

/** tools/qa/pane-probe.js for `seconds`, as the browser pane's javascript tool runs it; a probe that has not answered in 20 s is HUNG. */
async function probe(seconds) {
  const src = readFileSync(new URL('./pane-probe.js', import.meta.url), 'utf8').replace('(SECONDS = 30)', '(SECONDS = ' + seconds + ')');
  const at = Date.now();
  const r = await Promise.race([p.page.evaluate(src), sleep(20000).then(() => ({ error: 'HUNG' }))]).catch((e) => ({ error: String(e && e.message || e) }));
  return { ms: Date.now() - at, error: r.error, fps: r.fps, stalled: r.stalled, stillSpans: r.stillSpans };
}

function diff(a, b) { const o = {}; for (const k of Object.keys(a)) if ((a[k] || 0) - (b[k] || 0)) o[k] = a[k] - (b[k] || 0); return o; }

/** Show the page (`how`), then: when the first answer from the engine lands, when the world canvas first changes, and
 *  whether the hunt view is alive 10 s later (the picture keeps changing, the Leave control is there). */
async function resume(how) {
  const pic0 = await p.page.evaluate(() => window.__lh.picture()).catch(() => null);
  const asks0 = (await p.page.evaluate(() => window.__lh.asks['hr-accrue'] || 0));
  const at = Date.now();
  await how();
  let firstPicture = null, firstAsk = null;
  while (Date.now() - at < 30000 && (firstPicture === null || firstAsk === null)) {
    const [pic, asks] = await p.page.evaluate(() => [window.__lh.picture(), window.__lh.asks['hr-accrue'] || 0]);
    if (firstPicture === null && pic !== pic0) firstPicture = Date.now() - at;
    if (firstAsk === null && asks > asks0) firstAsk = Date.now() - at;
    await sleep(50);
  }
  const seen = new Set();
  for (let i = 0; i < 20; i++) { seen.add(await p.page.evaluate(() => window.__lh.picture())); await sleep(500); }
  return { firstFreshFrameMs: firstPicture, firstEngineAskMs: firstAsk, distinctPictures10s: seen.size, leave: await p.page.evaluate(() => !!document.querySelector('[data-hs-act="leave"]')) };
}

function table(rows) {
  const head = 'phase    t(s)  heapMB  nodes  elems  listnr  tmo  int  raf/f  fps  p95ms  long  ws  topics  canv  Mpx   asks(accrue/load)';
  return head + '\n' + rows.map((r) => [r.phase.padEnd(7), String(r.at).padStart(5), String(r.heapMB).padStart(7), String(r.nodes).padStart(6), String(r.elements).padStart(6),
    String(r.listeners).padStart(7), String(r.timers.t).padStart(4), String(r.timers.i).padStart(4), (r.frames ? (r.rafCalls / r.frames).toFixed(2) : '-').padStart(6),
    String(r.fpsP50).padStart(4), String(r.frameP95).padStart(6), String(r.long.n).padStart(5), String(r.ws.open).padStart(3), String(r.topics.length).padStart(7),
    String(r.canvases).padStart(5), String(r.canvasMpx).padStart(5), '  ' + (r.asks['hr-accrue'] || 0) + '/' + (r.asks.hr_load || 0)].join(' ')).join('\n');
}
