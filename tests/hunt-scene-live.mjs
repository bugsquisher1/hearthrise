#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-scene-live.mjs — THE LIVE HUNT, FROM A REAL POST-REBUILD ENVELOPE.
//
//   node tests/hunt-scene-live.mjs            the rules (node + headless Chrome)
//   node tests/hunt-scene-live.mjs --node     the node rules only
//   node tests/hunt-scene-live.mjs --mutate   every planted defect must turn its rule RED
//
// mutant-anchors: src/session/character-session.js src/session/config.js src/session/hunt-sections.js src/shell/widgets/action-bar.js
// mutant-writes-tree: no — mutants are planted into a temp copy of src/
//
// The P0 of v0.2.7 (2026-10-19). tests/fixtures/hunt-envelope-live.json is
// hr_state_of for the QA character, read from production at 15:39:57 UTC while
// it hunted Mill Cellar (shop, progress and farm trimmed). The windows are the
// SHIPPED engine (accrual.js accrueHunt) on the SHIPPED Mill Cellar ground
// (hunt-ground.js), cut every SESSION_CONFIG.huntPollMs exactly as the player
// door cuts them, each turned into the settle answer's timeline by hunt-track.js.
//
//   LV-1  A READ ALONE DRAWS THE HUNT: after hr_load only (no settle answer has
//         arrived, the player door's floor answered the poll), the scene draws
//         the viewed hero and the pose's monsters at their tiles. (Was: no clock,
//         nobody drawn: "an empty cellar".)
//   LV-2  NO SLIDESHOW: windows arriving every huntPollMs, each describing the
//         PAST poll, play continuously: no frame moves a unit more than half a
//         tile, the hero walks in many frames (not one jump per window), and no
//         frame plays more than 100 ms of the server's events at once. (Was: 600 ms
//         behind a 16 s cadence, a whole window landed in the past, the scene
//         jumped to its end and froze until the next.)
//   LV-3  REGEN IN REAL UNITS: the vitals strip reads +HP/s and +mana/s at the
//         engine's in-fight rates from the server's max HP, mana regen and
//         Prayer rate (0.6 HP/s at 180 HP), never a per-minute figure as /s.
//   LV-4  THE PAGE (headless Chrome, the real client over a stubbed server fed
//         the envelope and the windows): the hunt draws, no page error, and the
//         frame loop holds budget (median rAF gap and main-thread busy time per
//         frame, measured by the CDP profiler).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const LIVE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/hunt-envelope-live.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const FN = 'supabase/functions/hr-accrue';
const BUDGET = Object.freeze({ maxStepTiles: 0.5, minMovingShare: 0.05, maxEventSpreadMs: 100, gapMedianMs: 25, simBusyFactor: 1.25, simBusySlackMs: 2 });

async function load(base) {
  const u = (p) => import(pathToFileURL(join(base, p)).href + V);
  const e = (p) => import(pathToFileURL(join(ROOT, p)).href);   // the engine: always the shipped tree
  return {
    C: await u('src/session/character-session.js'),
    CFG: await u('src/session/config.js'),
    HSX: await u('src/session/hunt-sections.js'),
    S: await u('src/hunt-view/scene.js'),
    B: await u('src/world/core/book.js'),
    SETS: await u('src/data/world/atlas-sets.js'),
    AB: base,
    AC: await e(FN + '/accrual.js'),
    HG: await e(FN + '/hunt-ground.js'),
    HT: await e(FN + '/hunt-track.js'),
    SPAWN: await e('src/core/hunt-spawn.js'),
    SB: await e('src/data/supply-basics.js'),
    XP: await e('src/core/xp.js'),
    ITEMS: (await e('src/data/items.js')).ITEMS,
    MONSTERS: (await e('src/data/monsters.js')).MONSTERS,
  };
}

/* ── THE WINDOWS: the shipped engine on the shipped ground, cut at the player door's cadence. ── */
const T0 = Date.parse(LIVE.hunt.session.hunt_from);
function engineServer(M) {
  const where = M.HG.huntGroundOf('mill_cellar');
  const basics = {};
  for (const b of M.SB.BASIC_SUPPLIES) basics[b.id] = { kind: b.kind, price: b.price, heals: b.heals || 0, mana: b.mana || 0, partner: b.partner };
  const L = LIVE.level.level;
  const skills = { melee: LIVE.skills.melee.xp, defense: LIVE.skills.defense.xp, ranged: 0, magic: 0 };
  const hero = M.SPAWN.heroSetup({ weaponType: 'sword', options: {}, bar: [], partyRoles: ['tank'] });
  const m = {
    key: 'live', user: 'live', slot: 0, seat: 0, unitId: null, sessionId: 's-live', version: 1, huntId: 'mill_cellar',
    huntSession: { id: 's-live', instanceId: 'i-live', huntFromMs: T0, nextSwingAtMs: T0, swingIndex: 0, bag: {},
      staminaMs: 8 * 3600000, staminaMaxMs: 8 * 3600000, basics, shop: { heal: M.SB.basicFor('heal', 1).id, mana: M.SB.basicFor('mana', 1).id },
      goldFloor: 0, supplySource: 'mine', onEmpty: 'switch', cover: {} },
    skills, levelXp: M.XP.charXpForLevel(L), xpFrac: null, hp: LIVE.state.hp, gold: 0, equipment: clone(LIVE.equipment),
    inventory: {}, deathsTodayBefore: 0, deathsLifetimeBefore: 0, hearthfindReady: false, perks: null, hero,
  };
  let world = null, next = T0, from = T0;
  const run = (to, mem) => M.AC.accrueHunt({ instance: { id: 'i-live', nextSwingAtMs: next, world }, window: { fromMs: from, toMs: to },
    secret: '-4611686018427387904', ground: where.ground, grid: where.grid, items: M.ITEMS, monsters: M.MONSTERS, members: [mem] });
  const copy = () => Object.assign(JSON.parse(JSON.stringify(m)), { hero });
  return {
    get from() { return from; },
    get unit() { return m.unitId; },
    /* THE PLAYER DOOR'S SETTLE: commit [settled_to, to]. */
    commit(to) {
      const r = run(to, m);
      if (!r.accrued) return null;
      const tl = M.HT.huntTimeline(r.track, r.events, from, r.settledTo, to, r.units);
      world = r.world; next = r.settledTo; from = r.settledTo;
      const h = r.members[0].hunt;
      m.huntSession = Object.assign({}, m.huntSession, { swingIndex: h.swing_to, nextSwingAtMs: Date.parse(h.next_swing_at), staminaMs: h.stamina });
      m.unitId = h.unit_id; m.hp = r.members[0].delta.hp;
      return tl;
    },
    /* THE WATCH'S PEEK: the same window, never committed. */
    peek(to) {
      const r = run(to, copy());
      return r.accrued ? M.HT.huntTimeline(r.track, r.events, from, r.settledTo, to, r.units) : null;
    },
  };
}

/* The live loop the client runs while watched: a hunt_watch every huntWatchMs answered as the edge
   answers it (a peek below the 15 s floor, a commit past it), frames at 60 Hz. */
async function playWatched(M, book, spanMs, onFrame) {
  const srv = engineServer(M);
  const OFF = 1000000;            // client clock = server clock - OFF (any constant)
  const clock = { t: T0 - 500 - OFF };
  const env = () => { const e = Object.assign(clone(LIVE), { now: new Date(clock.t + OFF).toISOString() }); e.hunt.pose = null; e.hunt.hero.unit = 1; return e; };
  let version = LIVE.version;
  const server = {
    rpc: async () => ({ ok: true, body: env() }),
    accrue: async (body) => {
      const s = clock.t + OFF;
      if (!body || body.verb !== 'hunt_watch') return { ok: true, body: { ok: true, accrued: false } };
      if (s - srv.from >= 15000) {
        const tl = srv.commit(s);
        return { ok: true, body: Object.assign(env(), { version: ++version, settled: true }, tl || {}) };
      }
      return { ok: true, body: Object.assign({ ok: true, settled: false, watch: true }, srv.peek(s) || { hunt_server_now_ms: s }) };
    },
  };
  const cs = new M.C.CharacterSession({ slot: 0, uid: '11111111-2222-3333-4444-555555555555', server, setTimer: () => 0, clearTimer: () => {}, now: () => clock.t });
  await cs.load();
  cs.setWatched(true);
  const scene = M.S.createHuntScene({ timeline: cs.timeline, book, read: () => M.S.readHunt(cs) });
  const played = [];
  cs.timeline.subscribe((ev) => { played.push(ev.atMs); scene.onEvent(ev, cs.now()); });
  const watchMs = M.CFG.SESSION_CONFIG.huntWatchMs;
  let nextPoll = T0 + watchMs;
  for (let s = T0 - 500; s < T0 + spanMs; s += 1000 / 60) {
    clock.t = s - OFF;
    if (s >= nextPoll) { nextPoll += watchMs; await cs.watch(); }
    played.length = 0;
    cs.timeline.advance(clock.t);
    const f = scene.frame(clock.t);
    onFrame({ s, f, cs, played });
  }
}

/* A CharacterSession over a scripted server: hr_load answers `env()`, accrue the queued settle answer (or the floor). */
function session(M, clock, env, queue) {
  const server = {
    rpc: async () => ({ ok: true, body: env() }),
    accrue: async () => { const b = queue.shift(); return b ? { ok: true, body: b } : { ok: true, body: { ok: true, accrued: false } }; },
  };
  return new M.C.CharacterSession({ slot: 0, uid: '11111111-2222-3333-4444-555555555555', server, setTimer: () => 0, clearTimer: () => {}, now: () => clock.t });
}

function bookOf(M) {
  const manifests = {};
  for (const set of M.SETS.ATLAS_SETS) manifests[set] = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  return M.B.createBook(manifests);
}

async function nodeRules(M) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push(id + ': ' + msg); };
  const book = bookOf(M);

  { // LV-1
    const serverNow = Date.parse(LIVE.now);
    const clock = { t: 50000 };
    const cs = session(M, clock, () => clone(LIVE), []);
    await cs.load();
    const scene = M.S.createHuntScene({ timeline: cs.timeline, book, read: () => M.S.readHunt(cs) });
    clock.t += 1000;
    cs.timeline.advance(clock.t);
    const f = scene.frame(clock.t);
    const heroPose = LIVE.hunt.pose.units.find((u) => u.side === 'hero');
    const mons = LIVE.hunt.pose.units.filter((u) => u.side === 'monster');
    ok('LV-1', f.hero && Math.round(f.hero.x) === heroPose.x && Math.round(f.hero.y) === heroPose.y,
      `after hr_load alone the viewed hero is not drawn at its pose tile (${JSON.stringify(f.hero && { x: f.hero.x, y: f.hero.y })}, want ${heroPose.x},${heroPose.y}; server now ${serverNow})`);
    ok('LV-1', mons.every((p) => f.units.some((d) => d.unit === p.u)), `the pose's monsters are not drawn (${f.units.length} of ${mons.length})`);
  }

  { // LV-1 (from Enter), LV-2, LV-5
    const delay = M.CFG.SESSION_CONFIG.huntPlaybackDelayMs, watchMs = M.CFG.SESSION_CONFIG.huntWatchMs;
    let prev = null, frames = 0, moving = 0, maxStep = 0, maxBurst = 0, firstDrawn = null, firstMove = null;
    const kinds = new Set(); let barsSeen = 0, badBars = 0, emptyFrames = 0;
    const warn = console.warn; let unnamed = 0; console.warn = () => { unnamed++; };
    try {
      await playWatched(M, book, 160000, ({ s, f, cs, played }) => {
        const h = f.hero;
        if (h && firstDrawn === null) firstDrawn = s;
        if (h && prev) {
          const step = Math.hypot(h.x - prev.x, h.y - prev.y);
          maxStep = Math.max(maxStep, step);
          if (step > 1e-6) { moving++; if (firstMove === null) firstMove = s; }
        }
        if (h) { prev = h; frames++; } else if (s > T0) emptyFrames++;
        const spread = played.length ? Math.max(...played) - Math.min(...played) : 0;
        maxBurst = Math.max(maxBurst, spread);
        for (const d of f.units) {
          kinds.add(d.id);
          if (d.bar !== undefined && d.bar !== null) {
            barsSeen++;
            const hp = cs.timeline.hpAt(d.unit, cs.now());
            if (!hp || !(d.bar > 0) || Math.abs(d.bar - hp.hp / hp.maxHp) > 1e-9) badBars++;
          }
        }
      });
    } finally { console.warn = warn; }
    ok('LV-1', firstDrawn !== null && firstDrawn - (T0 - 500) <= 1000, `after Enter the hero was first drawn ${firstDrawn === null ? 'never' : (firstDrawn - T0 + 500) + ' ms'} after (budget 1000 ms; the entrance stands in until the first window)`);
    ok('LV-2', firstMove !== null && firstMove - T0 <= delay + watchMs + 1000, `the hero first moved ${firstMove === null ? 'never' : (firstMove - T0) + ' ms'} after the hunt began (near-live budget ${delay + watchMs + 1000} ms)`);
    ok('LV-2', emptyFrames === 0, `${emptyFrames} frame(s) drew no hero after the hunt began`);
    ok('LV-2', maxStep <= BUDGET.maxStepTiles, `a frame moved the hero ${maxStep.toFixed(2)} tiles (a teleport; budget ${BUDGET.maxStepTiles})`);
    ok('LV-2', moving / Math.max(1, frames) >= BUDGET.minMovingShare, `the hero moved in ${moving} of ${frames} frames (a slideshow)`);
    ok('LV-2', maxBurst <= BUDGET.maxEventSpreadMs, `one frame played ${maxBurst} ms of the server's events at once (a burst)`);
    ok('LV-5', unnamed === 0, `${unnamed} unit(s) had no sprite (drawn as nothing; was a brown stub box)`);
    ok('LV-5', kinds.size >= 2, `only ${[...kinds].join(', ')} monsters were drawn over the run (the pose was withheld: kinds must come from the unit book)`);
    ok('LV-5', barsSeen > 0 && badBars === 0, `${badBars} of ${barsSeen} monster bars were not the HP at the instant shown (a grey empty bar)`);
    console.log(`  LV-2 watched: first drawn ${firstDrawn - T0 + 500} ms after Enter, first move ${firstMove - T0} ms after the hunt began, hero moving in ${(100 * moving / Math.max(1, frames)).toFixed(1)}% of ${frames} frames, max step ${maxStep.toFixed(3)} tiles, widest event frame ${maxBurst} ms; monsters ${[...kinds].join('/')}, ${barsSeen} bars`);
  }

  { // LV-3
    const cs = session(M, { t: 1 }, () => clone(LIVE), []);
    await cs.load();
    const h = M.HSX.huntOf(cs).hero;
    const want = (LIVE.hunt.hero.hp_max * 3 * LIVE.hunt.hero.regen_pm) / 1e6;
    ok('LV-3', h.hpPerS !== null && Math.abs(h.hpPerS - want) < 1e-9, `HP regen reads ${h.hpPerS}/s, want ${want}/s (in-fight, per second)`);
    ok('LV-3', h.manaPerS !== null && Math.abs(h.manaPerS - LIVE.hunt.hero.mana_regen / 60) < 1e-9, `mana regen reads ${h.manaPerS}/s, want ${LIVE.hunt.hero.mana_regen / 60}`);
    const src = readFileSync(join(M.AB, 'src/shell/widgets/action-bar.js'), 'utf8');
    ok('LV-3', /regen\(hero\.hpPerS\)/.test(src) && /regen\(hero\.manaPerS\)/.test(src) && /'\/s'/.test(src), 'the vitals strip does not print hpPerS / manaPerS as /s');
  }
  return { fails, book };
}

/* Five seconds of the page's frame loop: rAF gaps, and main-thread busy time per frame from the CDP profiler. */
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
  if (process.env.HR_PROFILE) {
    const self = new Map();
    profile.samples.forEach((id, i) => { const c = byId.get(id).callFrame; const k = c.functionName + ' ' + c.url.split('/').slice(-2).join('/') + ':' + c.lineNumber; self.set(k, (self.get(k) || 0) + (profile.timeDeltas[i] || 0) / 1000); });
    console.log([...self].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, v]) => '    ' + v.toFixed(0).padStart(6) + ' ms ' + k).join('\n'));
  }
  return { frames: ts.length, gapMed: gaps[gaps.length >> 1], busy: busy / Math.max(1, ts.length) };
}

/* ── LV-4: the page. ── */
async function pageRules(M) {
  const fails = [];
  const { chromium } = await import('playwright');
  const { launchOptions } = await import('./_chrome.mjs');
  const H = await import('./_client-harness.mjs');
  /* The page's server: the shipped engine on the real ground, answering hunt_watch like the edge
     (a peek below the floor, a commit past it), its clock mapped onto the page's. */
  const srv = engineServer(M);
  const start = Date.now();
  let version = LIVE.version;
  const shift = (ms) => ms - T0 + start;
  const engNow = () => T0 + (Date.now() - start);
  const envNow = () => { const e = clone(LIVE); e.version = ++version; e.now = new Date().toISOString(); e.hunt.pose = null; return e; };
  const shiftTl = (tl) => (tl ? { hunt_track: tl.hunt_track.map((x) => ({ ...x, atMs: shift(x.atMs) })),
    hunt_events: tl.hunt_events.map((ev) => ({ ...ev, atMs: shift(ev.atMs) })), hunt_units: tl.hunt_units,
    hunt_from_ms: shift(tl.hunt_from_ms), hunt_server_now_ms: Date.now() } : { hunt_server_now_ms: Date.now() });
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
      if (name === 'hr_load') return json(envNow());
      if (name === 'hr-accrue') {
        const body = JSON.parse(r.request().postData() || '{}');
        if (body.verb !== 'hunt_watch') return json({ ok: true, accrued: false });
        const e = engNow();
        if (e - srv.from >= 15000) return json(Object.assign(envNow(), { settled: true }, shiftTl(srv.commit(e))));
        return json(Object.assign({ ok: true, settled: false, watch: true }, shiftTl(srv.peek(e))));
      }
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
    await page.waitForTimeout(2500);
    const game = await measureFrames(page);
    /* THE REFERENCE: the frozen sim (prototypes/hunt-sim) in the same browser, viewport and profiler. */
    const simPage = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await simPage.route('**/*', (r) => (r.request().url().startsWith('http://127.0.0.1:') ? r.continue() : r.fulfill({ status: 204, body: '' })));   // offline: no web fonts
    await simPage.goto('http://127.0.0.1:' + port + '/prototypes/hunt-sim/index.html', { waitUntil: 'domcontentloaded' });
    await simPage.waitForTimeout(2500);
    const sim = await measureFrames(simPage);
    console.log(`  LV-4 page: game ${game.frames} frames in 5 s, rAF gap median ${game.gapMed.toFixed(1)} ms, main thread busy ${game.busy.toFixed(1)} ms/frame; `
      + `sim ${sim.frames} frames, gap ${sim.gapMed.toFixed(1)} ms, busy ${sim.busy.toFixed(1)} ms/frame; ${errors.length} error(s)`);
    if (process.env.HR_SHOTS) await simPage.screenshot({ path: join(process.env.HR_SHOTS, 'hunt-sim.png') });
    const gapMed = game.gapMed;
    const busyCap = sim.busy * BUDGET.simBusyFactor + BUDGET.simBusySlackMs;
    const text = await page.evaluate(() => (document.querySelector('[data-regen="hp"]') || {}).textContent || '');
    if (!/^\+\d+(\.\d)?\/s$/.test(text)) fails.push(`LV-3 the page's HP regen reads "${text}", want +N.N/s`);
    if (errors.length) fails.push('LV-4 page errors: ' + errors.slice(0, 3).join(' | '));
    if (!(gapMed <= BUDGET.gapMedianMs)) fails.push(`LV-4 the frame loop's median gap is ${gapMed.toFixed(1)} ms (budget ${BUDGET.gapMedianMs})`);
    if (!(game.busy <= busyCap)) fails.push(`LV-4 the main thread is busy ${game.busy.toFixed(1)} ms per frame, over the sim's ${sim.busy.toFixed(1)} x ${BUDGET.simBusyFactor} + ${BUDGET.simBusySlackMs}`);
    if (process.env.HR_SHOTS) await page.screenshot({ path: join(process.env.HR_SHOTS, 'hunt-live.png') });
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

/* ── --mutate: each planted defect must turn its rule RED (node rules). ── */
const MUTANTS = [
  ['a read carries no clock (LV-1)', 'src/session/character-session.js', '      if (Number.isSafeInteger(ms)) this.timeline.ingest({ serverNowMs: ms }, this._now());', '', /^LV-1/],
  ['no entrance stand-in before the first window (LV-1)', 'src/hunt-view/scene.js', '    if (!hero && read.viewed !== null && read.entrance) hero = unitAt(read.viewed, now, read.entrance);', '', /^LV-1/],
  ['the scene plays 600 ms behind a 2 s watch (LV-2)', 'src/session/config.js', '  huntPlaybackDelayMs: 3500,', '  huntPlaybackDelayMs: 600,', /^LV-2/],
  ['the viewed hunt is not watched (16 s polls; LV-2)', 'src/session/character-session.js', '    this._watched = on === true;', '    this._watched = false;', /^LV-2/],
  ['a monster the snapshot dropped is unnamed (LV-5)', 'src/hunt-view/scene.js', "(typeof tl.kindOf === 'function' ? tl.kindOf(u) : null)", 'null', /^LV-5/],
  ["a monster's bar is the snapshot's HP (LV-5)", 'src/hunt-view/scene.js', "const played = hero || typeof tl.hpAt !== 'function' ? null : tl.hpAt(u, now);", 'const played = null;', /^LV-5/],
  ['the per-minute figure printed as /s (LV-3)', 'src/shell/widgets/action-bar.js', 'regen(hero.hpPerS)', 'regen(hero.hpPerS * 60)', /^LV-3/],
  ['HP regen at the resting rate (LV-3)', 'src/session/hunt-sections.js', '* VITALS.inFightRegenPermillePerS *', '* 60 *', /^LV-3/],
];

async function mutate() {
  let escaped = 0;
  for (const [name, file, from, to, arm] of MUTANTS) {
    const base = mkdtempSync(join(tmpdir(), 'hr-hsl-'));
    try {
      cpSync(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
      const p = join(base, file);
      const src = readFileSync(p, 'utf8');
      if (src.split(from).length !== 2) { console.error(`harness: anchor for "${name}" not found once`); process.exit(2); }
      writeFileSync(p, src.replace(from, to));
      const { fails } = await nodeRules(await load(base));
      const hit = fails.some((f) => arm.test(f));
      console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${name}`);
      if (!hit) escaped++;
    } finally { rmSync(base, { recursive: true, force: true }); }
  }
  console.log(escaped ? `hunt-scene-live --mutate: ${escaped} mutant(s) ESCAPED` : `hunt-scene-live --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
  process.exit(escaped ? 1 : 0);
}

async function main() {
  if (process.argv.includes('--mutate')) return mutate();
  const M = await load(ROOT);
  const { fails } = await nodeRules(M);
  if (!process.argv.includes('--node')) fails.push(...await pageRules(M));
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? `hunt-scene-live: ${fails.length} rule(s) RED` : 'hunt-scene-live: a read draws the hunt, playback is continuous, regen in real units, the page holds its frame budget');
  process.exit(fails.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
