#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-scene-live.mjs — THE LIVE HUNT, FROM A REAL POST-REBUILD ENVELOPE.
//
//   node tests/hunt-scene-live.mjs            the rules (node + headless Chrome)
//   node tests/hunt-scene-live.mjs --node     the node rules only
//   node tests/hunt-scene-live.mjs --mutate   every planted defect must turn its rule RED
//
// mutant-anchors: src/session/character-session.js src/session/config.js src/session/hunt-sections.js src/shell/widgets/vitals-hub.js
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
function windows(M, spanMs) {
  const where = M.HG.huntGroundOf('mill_cellar');
  const basics = {};
  for (const b of M.SB.BASIC_SUPPLIES) basics[b.id] = { kind: b.kind, price: b.price, heals: b.heals || 0, mana: b.mana || 0, partner: b.partner };
  const L = LIVE.level.level;
  const skills = { melee: LIVE.skills.melee.xp, defense: LIVE.skills.defense.xp, ranged: 0, magic: 0 };
  const m = {
    key: 'live', user: 'live', slot: 0, seat: 0, unitId: null, sessionId: 's-live', version: 1, huntId: 'mill_cellar',
    huntSession: { id: 's-live', instanceId: 'i-live', huntFromMs: T0, nextSwingAtMs: T0, swingIndex: 0, bag: {},
      staminaMs: 8 * 3600000, staminaMaxMs: 8 * 3600000, basics, shop: { heal: M.SB.basicFor('heal', 1).id, mana: M.SB.basicFor('mana', 1).id },
      goldFloor: 0, supplySource: 'mine', onEmpty: 'switch', cover: {} },
    skills, levelXp: M.XP.charXpForLevel(L), xpFrac: null, hp: LIVE.state.hp, gold: 0, equipment: clone(LIVE.equipment),
    inventory: {}, deathsTodayBefore: 0, deathsLifetimeBefore: 0, hearthfindReady: false, perks: null,
    hero: M.SPAWN.heroSetup({ weaponType: 'sword', options: {}, bar: [], partyRoles: ['tank'] }),
  };
  const poll = M.CFG.SESSION_CONFIG.huntPollMs;
  let world = null; let next = T0; const out = [];
  for (let from = T0; from < T0 + spanMs; from += poll) {
    const to = from + poll;
    const r = M.AC.accrueHunt({ instance: { id: 'i-live', nextSwingAtMs: next, world }, window: { fromMs: from, toMs: to },
      secret: '-4611686018427387904', ground: where.ground, grid: where.grid, items: M.ITEMS, monsters: M.MONSTERS, members: [m] });
    if (!r.accrued) continue;
    world = r.world; next = r.settledTo;
    const h = r.members[0].hunt;
    m.huntSession = Object.assign({}, m.huntSession, { swingIndex: h.swing_to, nextSwingAtMs: Date.parse(h.next_swing_at), staminaMs: h.stamina });
    m.unitId = h.unit_id; m.hp = r.members[0].delta.hp;
    out.push({ at: r.settledTo, unit: h.unit_id, tl: M.HT.huntTimeline(r.track, r.events, from, r.settledTo, r.settledTo) });
  }
  return out;
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

  { // LV-2
    const wins = windows(M, 160000);
    const poll = M.CFG.SESSION_CONFIG.huntPollMs;
    ok('LV-2', wins.length >= 8 && wins.some((w) => w.tl.hunt_track.length > 4), `the engine produced ${wins.length} windows, too few to judge playback`);
    const OFF = 1000000;            // client clock = server clock - OFF (any constant)
    const clock = { t: T0 - OFF };
    /* The recorded pose is another minute of another run: this run's poses come from its own windows. */
    const env = () => { const e = Object.assign(clone(LIVE), { now: new Date(clock.t + OFF).toISOString() }); e.hunt.pose = null; return e; };
    const queue = [];
    const cs = session(M, clock, env, queue);
    await cs.load();
    const scene = M.S.createHuntScene({ timeline: cs.timeline, book, read: () => M.S.readHunt(cs) });
    let delivered = 0;
    const burst = []; let worst = [];
    cs.timeline.subscribe((ev) => { delivered++; burst.push(ev.atMs); scene.onEvent(ev, cs.now()); });
    const unit = wins[0].unit;
    let wi = 0, prev = null, frames = 0, moving = 0, maxStep = 0, maxBurst = 0;
    const end = T0 + wins.length * poll;
    for (let s = T0 + 1; s < end; s += 1000 / 60) {
      clock.t = s - OFF;
      while (wi < wins.length && wins[wi].at <= s) {          // the answer to the poll at the window's end
        const w = wins[wi++];
        queue.push(Object.assign(env(), { accrued: true, version: LIVE.version + wi }, w.tl));
        await cs.hello();
      }
      const before = delivered; burst.length = 0;
      cs.timeline.advance(clock.t);
      const p = cs.timeline.positionAt(unit, clock.t);
      scene.frame(clock.t);
      const spread = burst.length ? Math.max(...burst) - Math.min(...burst) : 0;   // server ms one frame played at once
      if (spread > maxBurst) { maxBurst = spread; worst = burst.slice(); }
      if (p && prev) {
        const step = Math.hypot(p.x - prev.x, p.y - prev.y);
        maxStep = Math.max(maxStep, step);
        if (step > 1e-6) moving++;
      }
      if (p) { prev = p; frames++; }
    }
    ok('LV-2', frames > 600, `the hero was drawn in only ${frames} frames`);
    ok('LV-2', maxStep <= BUDGET.maxStepTiles, `a frame moved the hero ${maxStep.toFixed(2)} tiles (a teleport; budget ${BUDGET.maxStepTiles})`);
    ok('LV-2', moving / Math.max(1, frames) >= BUDGET.minMovingShare, `the hero moved in ${moving} of ${frames} frames (a slideshow)`);
    ok('LV-2', maxBurst <= BUDGET.maxEventSpreadMs, `one frame played ${maxBurst} ms of the server's events at once (a window's blows in a burst)`);
    console.log(`  LV-2 playback: ${frames} frames, hero moving in ${(100 * moving / Math.max(1, frames)).toFixed(1)}%, max step ${maxStep.toFixed(3)} tiles, widest frame of events ${maxBurst} ms of server time (${worst.length} events)`);
  }

  { // LV-3
    const cs = session(M, { t: 1 }, () => clone(LIVE), []);
    await cs.load();
    const h = M.HSX.huntOf(cs).hero;
    const want = (LIVE.hunt.hero.hp_max * 3 * LIVE.hunt.hero.regen_pm) / 1e6;
    ok('LV-3', h.hpPerS !== null && Math.abs(h.hpPerS - want) < 1e-9, `HP regen reads ${h.hpPerS}/s, want ${want}/s (in-fight, per second)`);
    ok('LV-3', h.manaPerS !== null && Math.abs(h.manaPerS - LIVE.hunt.hero.mana_regen / 60) < 1e-9, `mana regen reads ${h.manaPerS}/s, want ${LIVE.hunt.hero.mana_regen / 60}`);
    const src = readFileSync(join(M.AB, 'src/shell/widgets/vitals-hub.js'), 'utf8');
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
  const wins = windows(M, 200000);
  const poll = M.CFG.SESSION_CONFIG.huntPollMs;
  const start = Date.now();
  let version = LIVE.version;
  const shift = (ms) => ms - T0 + start - 2 * poll;       // the engine's clock mapped onto the page's
  const envNow = () => { const e = clone(LIVE); e.version = ++version; e.now = new Date().toISOString(); e.hunt.pose.at_ms = Date.now() - 1000; return e; };
  const shiftTl = (tl) => ({ hunt_track: tl.hunt_track.map((s) => ({ ...s, atMs: shift(s.atMs) })),
    hunt_events: tl.hunt_events.map((ev) => ({ ...ev, atMs: shift(ev.atMs) })), hunt_server_now_ms: Date.now() });
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
        const due = wins.filter((w) => shift(w.at) <= Date.now() && !w.sent);
        if (!due.length) return json({ ok: true, accrued: false });
        for (const w of due) w.sent = true;
        const tl = due.map((w) => shiftTl(w.tl));
        return json(Object.assign(envNow(), { accrued: true, hunt_track: tl.flatMap((t) => t.hunt_track), hunt_events: tl.flatMap((t) => t.hunt_events), hunt_server_now_ms: Date.now() }));
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
    const text = await page.evaluate(() => (document.querySelector('.hb-read-r[data-r="hp"]') || {}).textContent || '');
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
  ['the scene plays 600 ms behind a 16 s cadence (LV-2)', 'src/session/config.js', '  huntPlaybackDelayMs: 19000,', '  huntPlaybackDelayMs: 600,', /^LV-2/],
  ['the per-minute figure printed as /s (LV-3)', 'src/shell/widgets/vitals-hub.js', 'regen(hero.hpPerS)', 'regen(hero.hpPerS * 60)', /^LV-3/],
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
