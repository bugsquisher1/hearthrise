#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-scene-live.mjs — THE LIVE HUNT ON SCREEN (option B, Tyler 2026-10-19).
//
//   node tests/hunt-scene-live.mjs            the rules (node + headless Chrome)
//   node tests/hunt-scene-live.mjs --node     the node rules only
//   node tests/hunt-scene-live.mjs --mutate   every planted defect must turn its rule RED
//
// mutant-anchors: src/session/character-session.js src/session/live-link.js src/session/config.js src/session/hunt-sections.js src/shell/widgets/action-bar.js src/hunt-view/scene.js src/hunt-view/timeline.js
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
//         at the instant shown (never a grey empty bar; a monster killed mid-step is drawn dead).
//   LV-6  A PARTY: both heroes of a two-member instance are drawn for the whole run.
//   LV-3  REGEN IN REAL UNITS: +HP/s and +mana/s at the engine's in-fight rates.
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
const BUDGET = Object.freeze({ maxStepTiles: 0.5, maxEventSpreadMs: 100, gapMedianMs: 25, simBusyFactor: 1.25, simBusySlackMs: 2 });
const TRAVEL_MS = 20000;   // the server's travel time to Mill Cellar (hr_hunt_travel), as the session states it

async function load(base) {
  const u = (p) => import(pathToFileURL(join(base, p)).href + V);
  return {
    C: await u('src/session/character-session.js'),
    CFG: await u('src/session/config.js'),
    HSX: await u('src/session/hunt-sections.js'),
    S: await u('src/hunt-view/scene.js'),
    B: await u('src/world/core/book.js'),
    SETS: await u('src/data/world/atlas-sets.js'),
    base,
  };
}

function bookOf(M) {
  const manifests = {};
  for (const set of M.SETS.ATLAS_SETS) manifests[set] = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  return M.B.createBook(manifests);
}

/* The character's envelope for a hunt entered at `enteredMs` (travel TRAVEL_MS), its party listing `heroes`. */
function envFor(nowMs, enteredMs, heroes) {
  const e = clone(LIVE);
  e.now = new Date(nowMs).toISOString();
  e.hunt.pose = null;
  e.hunt.hero.unit = null;
  e.hunt.session.entered_at = new Date(enteredMs).toISOString();
  e.hunt.session.hunt_from = new Date(enteredMs + TRAVEL_MS).toISOString();
  e.party.members = heroes.map((h, i) => Object.assign(clone(LIVE.party.members[0]), { seat: i, unit: h.unit, name: h.name, weapon: h.weapon }));
  e.party.self = heroes[0].unit; e.party.leader = heroes[0].unit; e.party.max = heroes.length;
  return e;
}

/* A watched run: Enter at T0 - TRAVEL_MS, the engine starts at T0, the server answers the polls as
   the edge does (a start point below the floor, a commit with its check past it). */
async function playLive(M, LM, book, mis, spanMs, onFrame) {
  const T0 = LIVE_H.T0;
  const srv = LIVE_H.server(LM, mis);
  const OFF = 3000000;
  const entered = T0 - TRAVEL_MS;
  const clock = { t: entered - OFF };
  const heroes = () => mis.map((m, i) => ({ unit: m.unitId ?? (i === 0 ? null : null), name: 'Hero ' + (i + 1), weapon: 'sword' }));
  let version = LIVE.version, lastCommit = T0;
  const env = () => Object.assign(envFor(clock.t + OFF, entered, heroes()), { version: ++version });
  const server = {
    rpc: async () => ({ ok: true, body: env() }),
    accrue: async () => {
      const s = clock.t + OFF;
      if (s >= T0 && s - lastCommit >= 15000) {
        const c = srv.commit(s);
        lastCommit = s;
        if (c) return { ok: true, body: Object.assign(env(), { accrued: true, settled: true, hunt_check: c.check }, c.tl) };
      }
      return { ok: true, body: Object.assign(env(), { accrued: false, settled: false, reason: 'below_min_span', hunt_live: srv.live(mis[0].user) }) };
    },
  };
  const timers = [];
  const cs = new M.C.CharacterSession({ slot: 0, uid: '11111111-2222-3333-4444-555555555555', server,
    setTimer: (fn, ms) => { timers.push({ fn, at: clock.t + ms }); return timers.length; }, clearTimer: () => {}, now: () => clock.t });
  await cs.load();
  const scene = M.S.createHuntScene({ timeline: cs.timeline, book, read: () => M.S.readHunt(cs) });
  const played = [];
  cs.timeline.subscribe((ev) => { played.push(ev.atMs); scene.onEvent(ev, cs.now()); });
  for (let s = entered; s < T0 + spanMs; s += 1000 / 60) {
    clock.t = s - OFF;
    for (let i = 0; i < timers.length; i++) {
      if (timers[i] && timers[i].at <= clock.t) { const t = timers[i]; timers[i] = null; t.fn(); await new Promise((r) => setImmediate(r)); }
    }
    cs.liveAdvance(clock.t);
    const back = cs.takeReseeded(); if (back) scene.revive(back);
    played.length = 0;
    cs.timeline.advance(clock.t);
    onFrame({ s, f: scene.frame(clock.t), cs, played, T0, entered, mis });
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
    let firstDrawn = null, firstWalk = null, travelPlate = 0, travelFrames = 0, firstMove = null, prev = null, maxStep = 0, maxBurst = 0, empty = 0, frames = 0;
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
    ok('LV-2', maxBurst <= BUDGET.maxEventSpreadMs, `one frame played ${maxBurst} ms of events at once (a burst)`);
    ok('LV-5', unnamed === 0, `${unnamed} unit(s) had no sprite (drawn as nothing; was a brown stub box)`);
    ok('LV-5', kinds.size >= 2, `only ${[...kinds].join(', ')} monsters were drawn`);
    ok('LV-5', bars > 0 && badBars === 0, `${badBars} of ${bars} monster bars were not the HP at the instant shown`);
    console.log(`  LV-1/2 live: drawn ${firstDrawn} ms and walking ${firstWalk} ms after Enter (travel line ${travelPlate}/${travelFrames}); engine start -> first move ${firstMove} ms; ${frames} frames, max step ${maxStep.toFixed(3)} tiles, widest event frame ${maxBurst} ms, delay ${liveDelay} ms; monsters ${[...kinds].join('/')}, ${bars} bars`);
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

  { // LV-3
    const cs = new M.C.CharacterSession({ slot: 0, uid: '11111111-2222-3333-4444-555555555555',
      server: { rpc: async () => ({ ok: true, body: clone(LIVE) }), accrue: async () => ({ ok: true, body: { ok: true, accrued: false } }) },
      setTimer: () => 0, clearTimer: () => {}, now: () => 1 });
    await cs.load();
    const h = M.HSX.huntOf(cs).hero;
    const want = (LIVE.hunt.hero.hp_max * 3 * LIVE.hunt.hero.regen_pm) / 1e6;
    ok('LV-3', h.hpPerS !== null && Math.abs(h.hpPerS - want) < 1e-9, `HP regen reads ${h.hpPerS}/s, want ${want}/s`);
    ok('LV-3', h.manaPerS !== null && Math.abs(h.manaPerS - LIVE.hunt.hero.mana_regen / 60) < 1e-9, `mana regen reads ${h.manaPerS}/s`);
    const src = readFileSync(join(M.base, 'src/shell/widgets/action-bar.js'), 'utf8');
    ok('LV-3', /regen\(hero\.hpPerS\)/.test(src) && /regen\(hero\.manaPerS\)/.test(src) && /'\/s'/.test(src), 'the vitals strip does not print hpPerS / manaPerS as /s');
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
      const name = r.request().url().split('/').pop();
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
    const text = await page.evaluate(() => (document.querySelector('[data-regen="hp"]') || {}).textContent || '');
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
  ['a monster killed mid-step walks on alive (LV-5)', 'src/hunt-view/scene.js', '      if (p.moving && !(hpNow && hpNow.hp <= 0)) dead.delete(u);', '      if (p.moving) dead.delete(u);', /^LV-5/],
  ['no stand-in before the first swing (LV-1)', 'src/hunt-view/scene.js', '    if (!hero && read.entrance) hero = (read.viewed !== null && unitAt(read.viewed, now, read.entrance)) || standIn(now);', '', /^LV-1/],
  ['the live view keeps the server-paced delay (LV-2)', 'src/session/live-link.js', 'this._tl.setDelay(SESSION_CONFIG.liveDelayMs);', 'void 0;', /^LV-2/],
  ['the frame loop never advances the engine (LV-2)', 'src/session/live-link.js', '    return this.engine.advance(now, (b) => this._tl.ingest(b, clientNow));', '    return 0;', /^LV-2/],
  ['a monster the snapshot dropped is unnamed (LV-5)', 'src/hunt-view/scene.js', "(typeof tl.kindOf === 'function' ? tl.kindOf(u) : null)", 'null', /^LV-5/],
  ["a bar is the snapshot's HP (LV-5)", 'src/hunt-view/scene.js', "const played = typeof tl.hpAt !== 'function' ? null : tl.hpAt(u, now);", 'const played = null;', /^LV-5/],
  ['the per-minute figure printed as /s (LV-3)', 'src/shell/widgets/action-bar.js', 'regen(hero.hpPerS)', 'regen(hero.hpPerS * 60)', /^LV-3/],
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
