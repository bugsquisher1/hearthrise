#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/observability.mjs — ERRORS AND REPLAYS ARE WIRED, MASKED, AND OFF WHERE THEY MUST BE.
//
//   node tests/observability.mjs           the checks
//   node tests/observability.mjs --mutate  every planted defect must turn a check RED
//
// mutant-anchors: src/net/observability.js src/net/diagnostics.js src/net/observability-config.js src/app/boot.js src/shell/windows/chat.js src/shell/widgets/hunt-topbar.js play.html
//
// play.html in a real Chromium with the REAL vendored Sentry and PostHog SDKs,
// supabase-js and the REST paths stubbed (tests/_client-harness.mjs). The page is
// served AS https://hearthrise.net (a route onto the local server), so the host
// rule, the page's CSP and the SDKs' own requests are the shipped ones; the two
// ingest hosts are routed and recorded, nothing reaches the network.
//
//   OB-1  hearthrise.net: boot loads both SDKs from our origin and inits them:
//         Sentry release = BUILD.version, environment production, every error
//         sampled, no tracing, no replay; PostHog identified_only, autocapture
//         and pageviews off, nothing kept on the device, every input masked,
//         .ph-mask text masked
//   OB-2  an uncaught error, an unhandled rejection and a console.error reach
//         Sentry (through the CSP) carrying only the account id as the user
//   OB-3  replay is off on the sign-in and characters screens and on in the game;
//         the chat window carries the mask class
//   OB-4  hunt_started {hunt, party_size, density}, leave_hunt_clicked and
//         hunt_ended {reason, seconds} reach PostHog with the account id
//   OB-5  ?noanalytics=1 on hearthrise.net: no SDK loads, nothing is sent
//   OB-6  localhost: no SDK loads, nothing is sent
//   OB-7  (node, the real CharacterSession) live_view_stall: a starved engine is
//         reported once with how long it stalled when the next start point lands,
//         and each reseed with the reseed count; the per-load cap holds
//   OB-8  the vendored SDKs are byte-for-byte the pinned hashes in the config
//   OB-9  (node) the send gate: one error looped 100 times sends SEND_LIMITS.perFingerprint,
//         100 different errors stop at SEND_LIMITS.perLoad, network weather sends
//         nothing, the hang message passes a full gate
//   OB-10 the hang: a main-thread stall over 3 s with the tab visible sends ONE Sentry
//         message naming the open hunt and its live engine (node: a hidden tab and a
//         second stall send none; browser: a real 4 s busy loop reaches Sentry), and two
//         alternating looped console.errors reach Sentry 5 times each (the real SDK)
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { launchOptions } from './_chrome.mjs';
import { readFile, mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';

const BUILD_SRC = await readFile(join(ROOT, 'src/build-info.js'), 'utf8');
const VERSION = /version:\s*'([^']+)'/.exec(BUILD_SRC)[1];
const V = '?v=' + /cache:\s*'([^']+)'/.exec(BUILD_SRC)[1];
const HUNT = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
const SENTRY = /\.ingest\.us\.sentry\.io\//;
const POSTHOG = /^https:\/\/us(?:-assets)?\.i\.posthog\.com\//;

function envelope(version) {
  return { ok: true, version, now: '2026-10-17T00:00:00Z', state: { active_kind: 'idle', gold: 0 }, skills: {}, inventory: {}, hero_slots: [0, 1], account: { max_concurrent: 4 } };
}
/* The fixture hunt, open or (after the leave) ended with its reason and server timestamps. */
function huntBody(version, ended) {
  const b = Object.assign({}, HUNT, { version });
  if (ended) b.hunt = Object.assign({}, HUNT.hunt, { ended: true, session: { id: HUNT.hunt.session_id, hunt: HUNT.hunt.hunt_id, end_reason: 'left',
    entered_at: '2026-10-17T00:00:00Z', ended_at: '2026-10-17T00:05:00Z' } });
  return b;
}

/* A request body as PostHog sends it: JSON, gzip, or a base64 `data=` form. */
function posthogEvents(req) {
  const buf = req.postDataBuffer();
  if (!buf) return [];
  let text = '';
  try { text = /compression=gzip/.test(req.url()) ? gunzipSync(buf).toString('utf8') : buf.toString('utf8'); } catch { return []; }
  if (/^data=/.test(text)) text = Buffer.from(decodeURIComponent(text.slice(5)), 'base64').toString('utf8');
  try { const j = JSON.parse(text); return Array.isArray(j) ? j : Array.isArray(j.batch) ? j.batch : [j]; } catch { return []; }
}

const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
/* The event inside a Sentry envelope body, and its own first line (breadcrumbs carry earlier logs, so a
   body that merely CONTAINS a string is not an event about it). */
const sentryEvent = (b) => b.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((j) => j && (j.exception || j.message || j.logentry)) || null;
const sentryLine = (b) => { const e = sentryEvent(b); return e ? String(e.message || (e.logentry && e.logentry.message) || (e.exception && e.exception.values && e.exception.values[0].value) || '') : ''; };
const until = async (fn, ms = 10000) => { const t = Date.now() + ms; while (Date.now() < t) { if (fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

async function page(browser, base, o) {
  /* A desktop Chrome's user agent and no webdriver flag: PostHog drops an automated browser as a bot. */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' });
  /* ...and no 'HeadlessChrome' brand: a newer headless Chromium announces it in userAgentData, which PostHog also reads. */
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined });
  });
  /* The telemetry posts travel WITHOUT keepalive here (every frame: Sentry takes its fetch from a fresh
     iframe). Chrome caps a page's in-flight keepalive bytes at 64 KiB and releases them after the SDK has
     already counted the post done; with every post routed through this process the gap is wide, so on a
     loaded box a post (a looped error, then the 16 KB hang message) failed to fetch and was LOST, never
     late (2026-10-22, measured: transport.send rejected "Failed to fetch"). keepalive only matters for a
     post racing a closing tab, which no check here makes. */
  await ctx.addInitScript(() => {
    const F = window.fetch;
    window.fetch = function (input, init) {
      const url = String((input && input.url) || input);
      if (init && init.keepalive && /\.ingest\.us\.sentry\.io\/|^https:\/\/us(?:-assets)?\.i\.posthog\.com\//.test(url)) init = Object.assign({}, init, { keepalive: false });
      return F.call(this, input, init);
    };
  });
  const pg = await ctx.newPage();
  const seen = { scripts: [], sentry: [], posthog: [], events: [], errors: [], csp: [], harness: [] };
  pg.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) seen.csp.push(m.text()); });
  pg.on('pageerror', (e) => { if (!/obs-probe/.test(e.message)) seen.errors.push(e.message); });
  pg.on('request', (r) => { if (/\/src\/vendor\/(sentry|posthog)/.test(r.url())) seen.scripts.push(r.url().replace(/^.*\/src\//, 'src/')); });
  /* Registered first, so the stubs below (registered later) win where both match. Each forward
     is tracked: close() stops forwarding, then waits for every fetch in flight, so no fetch is
     ever cut by the context, the browser or the server closing under it. A fetch that fails
     while the page is live is a HARNESS failure, never a check's verdict (and never a crash). */
  const inflight = new Set();
  let closing = false;
  await pg.route('https://hearthrise.net/**', async (r) => {
    if (closing) return r.abort().catch(() => {});
    const f = r.fetch({ url: base + new URL(r.request().url()).pathname });
    inflight.add(f);
    let res;
    try { res = await f; } catch (e) {
      if (!closing) seen.harness.push('route.fetch ' + new URL(r.request().url()).pathname + ': ' + String(e && e.message).split('\n')[0]);
      return r.abort().catch(() => {});
    } finally { inflight.delete(f); }
    return r.fulfill({ response: res }).catch((e) => { if (!closing) seen.harness.push('route.fulfill: ' + String(e && e.message).split('\n')[0]); });
  });
  await pg.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pg.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await pg.route(SENTRY, (r) => { seen.sentry.push(r.request().postData() || ''); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await pg.route(POSTHOG, (r) => {
    const req = r.request();
    seen.posthog.push(new URL(req.url()).pathname);
    seen.events.push(...posthogEvents(req));
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  let v = 0;
  await pg.route('https://nezapsylztqbbwuwembx.supabase.co/**', (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    if (name === 'hr_hunt_leave') { o.left = true; return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); }
    if (name === 'hr_load' || name === 'hr-accrue') {
      v++;
      /* hr_load (the roster, the open) is idle and the join's hello hunts: this load SEES the hunt
         start; once left, every read is the ended hunt. */
      const b = o.hunt && (name === 'hr-accrue' || o.left) ? huntBody(v, o.left) : envelope(v);
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(name === 'hr-accrue' ? Object.assign({ accrued: true }, b) : b) });
    }
    return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
  });
  seen.stop = () => { closing = true; };
  const close = async () => {
    seen.stop();
    await Promise.allSettled([...inflight]);
    await ctx.close();
  };
  return { pg, seen, close };
}

async function signIn(pg) {
  await wait(pg, () => document.querySelector('form[data-auth="sign-in"]'));
  await pg.fill('input[name=email]', 'qa@example.test');
  await pg.fill('input[name=password]', 'not-a-real-password');
  await pg.click('.auth-submit');
  return wait(pg, () => document.querySelector('[data-app="play"][data-slot="0"]'));
}

async function browserChecks(overrides) {
  const fails = [];
  const { server, port } = await serve(overrides);
  /* No idle keep-alive timeout: the server never closes a socket route.fetch may be reusing (the
     reuse race is an ECONNRESET under load). Its sockets close with the server, after every fetch settled. */
  server.keepAliveTimeout = 0;
  const browser = await chromium.launch(launchOptions({ headless: true }));
  const opened = [];
  try {
    { // OB-1 .. OB-4
      const o = { hunt: true, left: false };
      const { pg, seen, close } = await page(browser, 'http://127.0.0.1:' + port, o);
      opened.push(seen);
      await pg.goto('https://hearthrise.net/play.html', { waitUntil: 'load' });
      const up = await wait(pg, () => window.Sentry && window.Sentry.getClient && window.Sentry.getClient() && window.posthog && window.posthog.__loaded);
      if (!up) fails.push('OB-1 the SDKs did not start on hearthrise.net (scripts: ' + seen.scripts.join(', ') + ')');
      else {
        const c = await pg.evaluate(() => {
          const s = window.Sentry.getClient().getOptions();
          const p = window.posthog.config;
          return { release: s.release, environment: s.environment, sampleRate: s.sampleRate, traces: s.tracesSampleRate, tracer: s.tracesSampler,
            replay: s.replaysSessionSampleRate, replayErr: s.replaysOnErrorSampleRate, pii: s.sendDefaultPii,
            integrations: (s.integrations || []).map((i) => i.name),
            profiles: p.person_profiles, autocapture: p.autocapture, pageview: p.capture_pageview,
            maskInputs: p.session_recording && p.session_recording.maskAllInputs, maskText: p.session_recording && p.session_recording.maskTextSelector,
            external: p.disable_external_dependency_loading, rec: p.disable_session_recording, persistence: p.persistence };
        });
        if (c.release !== VERSION || c.environment !== 'production' || c.sampleRate !== 1) fails.push('OB-1 Sentry release/environment/sampling: ' + JSON.stringify([c.release, c.environment, c.sampleRate]));
        if (c.traces !== undefined || c.tracer !== undefined || c.integrations.some((n) => /BrowserTracing|Replay/.test(n)) || c.replay || c.replayErr || c.pii) fails.push('OB-1 Sentry tracing/replay/PII is on: ' + JSON.stringify(c));
        if (!c.integrations.includes('CaptureConsole')) fails.push('OB-1 Sentry does not capture console.error: ' + c.integrations.join(','));
        if (c.profiles !== 'identified_only' || c.autocapture !== false || c.pageview !== false || c.external !== true) fails.push('OB-1 PostHog profiles/autocapture/pageview/external: ' + JSON.stringify(c));
        if (c.maskInputs !== true || c.maskText !== '.ph-mask, input, textarea') fails.push('OB-1 PostHog replay masking: ' + JSON.stringify([c.maskInputs, c.maskText]));
        if (c.rec !== true) fails.push('OB-3 replay is on at the sign-in screen');
        if (c.persistence !== 'memory') fails.push('OB-1 PostHog keeps its ids on the device: persistence ' + c.persistence);
      }
      if (seen.scripts.some((s) => !/^src\/vendor\/(sentry-browser-[\d.]+\.min|sentry-captureconsole-[\d.]+\.min|posthog-js-[\d.]+\.full\.no-external)\.js$/.test(s))) fails.push('OB-1 an SDK came from elsewhere: ' + seen.scripts.join(', '));
      if (!(await signIn(pg))) fails.push('OB-3 sign-in did not reach the characters screen');
      if (await pg.evaluate(() => window.posthog && window.posthog.config.disable_session_recording !== true)) fails.push('OB-3 replay is on at the characters screen (it names the email)');
      await pg.click('[data-app="play"][data-slot="0"]');
      if (!(await wait(pg, () => window.posthog && window.posthog.config.disable_session_recording === false))) fails.push('OB-3 replay did not start on the game screen');
      await wait(pg, () => document.querySelector('[data-hs-shell]'));
      await pg.keyboard.press('Enter');   // opens the chat window
      if (!(await wait(pg, () => document.querySelector('[data-hs-win="chat"] .hc-chat')))) fails.push('OB-3 the chat window did not open');
      else if (!(await pg.evaluate(() => document.querySelector('[data-hs-win="chat"] .hc-chat').classList.contains('ph-mask')))) fails.push('OB-3 the chat window is not masked (.ph-mask)');
      await pg.evaluate(() => {
        setTimeout(() => { throw new Error('obs-probe uncaught'); }, 0);
        setTimeout(() => { Promise.reject(new Error('obs-probe rejection')); }, 0);
        console.error('obs-probe console');
      });
      const probes = ['obs-probe uncaught', 'obs-probe rejection', 'obs-probe console'];
      if (!(await until(() => probes.every((p) => seen.sentry.some((b) => b.includes(p)))))) fails.push('OB-2 Sentry did not receive ' + probes.filter((p) => !seen.sentry.some((b) => b.includes(p))).join(', '));
      for (const b of seen.sentry.filter((x) => x.includes('obs-probe'))) {
        const ev = b.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((j) => j && j.exception || (j && j.message));
        if (!ev || !ev.user || ev.user.id !== UID || Object.keys(ev.user).some((k) => k !== 'id' && k !== 'ip_address') || b.includes('qa@example.test')) { fails.push('OB-2 a Sentry event carries more than the account id: ' + JSON.stringify(ev && ev.user)); break; }
        if (ev.release !== VERSION || ev.environment !== 'production') { fails.push('OB-2 a Sentry event release/environment: ' + JSON.stringify([ev.release, ev.environment])); break; }
      }
      /* OB-10: a loop of two alternating errors (Sentry's own dedupe only drops a repeat of the LAST
         event) is cut to SEND_LIMITS.perFingerprint each; a real stall sends the hang message once. */
      /* Waited for as STATE, never a fixed delay (1.5 s was a guess at how long delivery takes): both loops at their
         cap and an end marker logged after them, which the SDK sends after the loop's own events. */
      await pg.evaluate(() => { for (let i = 0; i < 40; i++) console.error('obs-probe loop ' + (i % 2 ? 'A' : 'B')); console.error('obs-probe loop end'); });
      const looped = (k) => seen.sentry.filter((b) => sentryLine(b) === 'obs-probe loop ' + k).length;
      await until(() => looped('A') >= 5 && looped('B') >= 5 && looped('end') === 1, 15000);
      const loops = ['A', 'B'].map(looped);
      if (loops.some((n) => n !== 5)) fails.push('OB-10 a looped console.error reached Sentry ' + loops.join(' and ') + ' times, want 5 each');
      await pg.evaluate(() => { const t = performance.now(); while (performance.now() - t < 4200) { /* the stall */ } });
      const stalled = () => seen.sentry.filter((b) => /^The page stalled/.test(sentryLine(b))).map(sentryEvent);
      if (!(await until(() => stalled().length > 0))) fails.push('OB-10 a 4 s main-thread stall never reached Sentry');
      else {
        await pg.waitForTimeout(1500);
        const hang = stalled();
        const hunt = hang[0].extra && Array.isArray(hang[0].extra.hunts) ? hang[0].extra.hunts[0] : null;
        if (hang.length !== 1 || JSON.stringify(hang[0].fingerprint) !== '["main-thread-hang"]' || !hunt || hunt.hunt !== HUNT.hunt.hunt_id)
          fails.push('OB-10 the hang message: ' + hang.length + ' sent, fingerprint ' + JSON.stringify(hang[0].fingerprint) + ', hunt ' + JSON.stringify(hunt));
      }
      if (!(await wait(pg, () => document.querySelector('[data-hs-widget="hunt-topbar"] [data-hs-act="leave"]:not([hidden])')))) fails.push('OB-4 the hunt never showed its Leave button');
      else await pg.click('[data-hs-widget="hunt-topbar"] [data-hs-act="leave"]');
      const ev = (n) => seen.events.find((e) => e && e.event === n);
      await until(() => ev('hunt_started') && ev('leave_hunt_clicked') && ev('hunt_ended'), 12000);
      const st = ev('hunt_started');
      const en = ev('hunt_ended');
      if (!st || st.properties.hunt !== HUNT.hunt.hunt_id || st.properties.party_size !== HUNT.party.members.length || st.properties.density !== (HUNT.hunt_density ? (HUNT.hunt_density[HUNT.hunt.hunt_id] ?? 0) : null))
        fails.push('OB-4 hunt_started: ' + JSON.stringify(st && { hunt: st.properties.hunt, party: st.properties.party_size, density: st.properties.density }) + ' (events: ' + seen.events.map((e) => e && e.event).join(',') + ')');
      if (!ev('leave_hunt_clicked')) fails.push('OB-4 no leave_hunt_clicked');
      if (!en || en.properties.reason !== 'left' || en.properties.seconds !== 300) fails.push('OB-4 hunt_ended: ' + JSON.stringify(en && { reason: en.properties.reason, seconds: en.properties.seconds }));
      const mine = seen.events.filter((e) => e && /^(hunt_started|hunt_ended|leave_hunt_clicked)$/.test(e.event));
      if (mine.some((e) => e.properties.distinct_id !== UID)) fails.push('OB-4 an event is not keyed by the account id: ' + mine.map((e) => e.properties.distinct_id).join(','));
      if (seen.events.some((e) => e && /^\$(autocapture|pageview|pageleave)$/.test(e.event))) fails.push('OB-1 PostHog sent autocapture/pageview events');
      if (JSON.stringify(seen.events).includes('qa@example.test')) fails.push('OB-4 an event carries the email');
      if (seen.csp.length) fails.push('OB-2 the CSP blocked telemetry: ' + seen.csp[0].slice(0, 200));
      if (seen.errors.length) fails.push('OB-1..4 page errors: ' + seen.errors.slice(0, 2).join(' | '));
      await close();
    }

    for (const [id, url] of [['OB-5', 'https://hearthrise.net/play.html?noanalytics=1'], ['OB-6', 'http://localhost:' + port + '/play.html']]) {
      const { pg, seen, close } = await page(browser, 'http://127.0.0.1:' + port, { hunt: false });
      opened.push(seen);
      await pg.goto(url, { waitUntil: 'load' });
      await signIn(pg);
      await pg.evaluate(() => { console.error('obs-probe console'); });
      await pg.waitForTimeout(1500);
      const g = await pg.evaluate(() => ({ s: typeof window.Sentry, p: typeof window.posthog }));
      if (seen.scripts.length || g.s !== 'undefined' || g.p !== 'undefined') fails.push(id + ' an SDK loaded: ' + JSON.stringify([seen.scripts, g]));
      if (seen.sentry.length || seen.posthog.length) fails.push(id + ' telemetry was sent: ' + seen.sentry.length + ' to Sentry, ' + seen.posthog.join(','));
      await close();
    }
  } catch (e) {
    fails.push('OB-0 the browser checks stopped: ' + String(e && e.message).split('\n')[0]);
  } finally {
    for (const s of opened) s.stop();
    await browser.close();
    server.close();
  }
  /* A forward that failed while its page was live: the page saw a broken site, so no verdict above is the
     product's. Reported as HARNESS, which --mutate never counts as a mutant's catch. */
  for (const s of opened) for (const h of s.harness) fails.push('HARNESS ' + h);
  return fails;
}

let RUNS = 0;
/* OB-7: the real CharacterSession and the module under a fake page whose SDKs record their calls. */
async function nodeChecks(root) {
  const fails = [];
  const u = (p) => pathToFileURL(join(root, p)).href + V;
  /* A fresh module per run: startObservability starts once per load, and a run must not reuse the last one's. */
  const OBS = await import(u('src/net/observability.js') + '&run=' + (++RUNS));
  const CS = await import(u('src/session/character-session.js'));
  const events = [];
  const timers = {};
  let clock = 1000;
  const sdk = { init: () => sdk, capture: (n, p) => events.push([n, p]), identify() {}, reset() {}, startSessionRecording() {}, stopSessionRecording() {} };
  const messages = [];
  let opts = null;
  const sentry = { init(o) { opts = o; }, setUser() {}, captureException() {}, captureMessage: (m, c) => messages.push([m, c]),
    captureConsoleIntegration: () => ({ name: 'CaptureConsole' }) };
  const win = {
    location: { hostname: 'hearthrise.net', search: '', href: 'https://hearthrise.net/play.html' },
    performance: { now: () => clock }, addEventListener() {}, removeEventListener() {},
    setInterval: (fn, ms) => { timers[ms] = fn; return 1; },
    document: { visibilityState: 'visible', createElement: () => ({}), head: { appendChild(s) { if (/posthog/.test(s.src)) win.posthog = sdk; else win.Sentry = sentry; s.onload(); } } },
  };
  const obs = OBS.startObservability(win);
  const tick = timers[1000];
  const beat = timers[500];
  if (!obs.send || !tick || !beat || !opts) { fails.push('OB-7 the module did not start on hearthrise.net'); return fails; }
  let body = null;
  const cs = new CS.CharacterSession({ slot: 0, uid: UID, server: { rpc: async () => ({ ok: true, body }) }, setTimer: () => 0, clearTimer() {} });
  let running = true;
  cs.live.running = () => running;
  body = envelope(1); await cs.load();
  body = huntBody(2, false); await cs.load();
  cs._emit('live');                               // the engine seeded (live-link.js emits 'live')
  clock += 4000; running = false; tick();         // it starves between answers: nothing is emitted
  clock += 2500; tick();
  clock += 500; running = true; cs._emit('live'); // the next start point lands
  clock += 3000; cs._emit('reseed');
  clock += 1000; cs._emit('reseed');
  const stalls = events.filter(([n]) => n === 'live_view_stall').map(([, p]) => p);
  const want = [{ kind: 'starve', ms: 3000, reseeds: 0 }, { kind: 'reseed', ms: 3000, reseeds: 1 }, { kind: 'reseed', ms: 1000, reseeds: 2 }];
  if (JSON.stringify(stalls) !== JSON.stringify(want)) fails.push('OB-7 live_view_stall sent ' + JSON.stringify(stalls) + ', want ' + JSON.stringify(want));
  for (let i = 0; i < 80; i++) cs._emit('reseed');
  if (events.filter(([n]) => n === 'live_view_stall').length !== 50) fails.push('OB-7 the per-load cap did not hold: ' + events.filter(([n]) => n === 'live_view_stall').length);
  if (events.filter(([n]) => n === 'hunt_started').length !== 1) fails.push('OB-7 hunt_started ' + events.filter(([n]) => n === 'hunt_started').length + ' times for one seen start');

  /* OB-10 (node): a hidden tab's late timer is not a hang; the first visible stall over 3 s is, once. */
  win.document.visibilityState = 'hidden'; clock += 6000; beat();
  win.document.visibilityState = 'visible'; clock += 500; beat();
  if (messages.length) fails.push('OB-10 a hidden tab\'s late timer was reported as a hang');
  clock += 4500; beat();
  clock += 9000; beat();
  const hangs = messages.filter(([m]) => /stalled/.test(m));
  if (hangs.length !== 1) fails.push('OB-10 ' + hangs.length + ' hang message(s) for two stalls, want exactly 1');
  else {
    const c = hangs[0][1] || {};
    const h = c.extra && Array.isArray(c.extra.hunts) ? c.extra.hunts[0] : null;
    if (!c.fingerprint || c.fingerprint[0] !== 'main-thread-hang' || !c.extra || c.extra.stall_ms !== 4000 || !c.extra.version)
      fails.push('OB-10 the hang message carries ' + JSON.stringify(c).slice(0, 200));
    if (!h || h.hunt !== HUNT.hunt.hunt_id || h.session !== HUNT.hunt.session_id || !('swing' in h) || !('running' in h) || !h.stats)
      fails.push('OB-10 the hang message does not name the open hunt and its engine: ' + JSON.stringify(h));
  }

  /* OB-9: the send gate, through the beforeSend Sentry is given. */
  const err = (value, fn) => ({ exception: { values: [{ type: 'Error', value, stacktrace: { frames: [{ filename: 'https://hearthrise.net/src/x.js?v=1', function: fn }] } }] } });
  const pass = (e) => opts.beforeSend(e) !== null;
  if (pass({ exception: { values: [{ type: 'TypeError', value: 'Failed to fetch' }] } }) || pass({ message: 'Auto refresh tick failed with error. This is likely a transient error. TypeError: Failed to fetch' }))
    fails.push('OB-9 network weather was sent');
  let n = 0;
  for (let i = 0; i < 100; i++) if (pass(err('boom at swing ' + i, 'loop'))) n++;
  if (n !== OBS.SEND_LIMITS.perFingerprint) fails.push('OB-9 one error looped 100 times sent ' + n + ', want ' + OBS.SEND_LIMITS.perFingerprint);
  const word = (i) => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26));
  for (let i = 0; i < 100; i++) if (pass(err('different ' + word(i), 'f' + word(i)))) n++;
  if (n !== OBS.SEND_LIMITS.perLoad) fails.push('OB-9 100 different errors took the load to ' + n + ' sent, want the ceiling ' + OBS.SEND_LIMITS.perLoad);
  if (!pass({ message: 'The page stalled for 4.0 s', fingerprint: ['main-thread-hang'] })) fails.push('OB-9 the hang message was held back by the full gate');
  return fails;
}

async function hashChecks(root) {
  const fails = [];
  const cfg = await readFile(join(root, 'src/net/observability-config.js'), 'utf8');
  const pins = [...cfg.matchAll(/src: '(src\/vendor\/[^']+)', integrity: 'sha384-([^']+)'/g)];
  if (pins.length !== 3) fails.push('OB-8 the config pins ' + pins.length + ' scripts, want 3');
  for (const [, src, h] of pins) {
    const got = createHash('sha384').update(await readFile(join(root, src))).digest('base64');
    if (got !== h) fails.push('OB-8 ' + src + ' is not the pinned build (sha384 ' + got + ')');
  }
  return fails;
}

async function checks(overrides) {
  let root = ROOT;
  let tmp = null;
  if (overrides && Object.keys(overrides).some((f) => f.startsWith('src/'))) {
    tmp = await mkdtemp(join(tmpdir(), 'hr-obs-'));
    await cp(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true });
    for (const [f, t] of Object.entries(overrides)) if (f.startsWith('src/')) await writeFile(join(tmp, f), t);
    root = tmp;
  }
  try {
    return [...await hashChecks(root), ...await nodeChecks(root), ...await browserChecks(overrides)];
  } finally { if (tmp) await rm(tmp, { recursive: true, force: true }); }
}

const MUTANTS = [
  ['the boot never starts telemetry', 'src/app/boot.js', 'const obs = startObservability(win);', 'const obs = { screen() {}, identify() {}, forget() {} };'],
  ['inputs are recorded in the clear', 'src/net/observability.js', 'maskAllInputs: true', 'maskAllInputs: false'],
  ['replay runs on the sign-in screen', 'src/net/observability.js', 'disable_session_recording: true,', 'disable_session_recording: false,'],
  ['the kill switch is ignored', 'src/net/observability.js', 'noanalytics=1(?:&|$)', 'noanalytics=never(?:&|$)'],
  ['localhost sends', 'src/net/observability.js', "toLowerCase()] || 'dev';", "toLowerCase()] || 'production';"],
  ['the user carries the email', 'src/app/boot.js', 'obs.identify(auth.userId());', 'obs.identify(auth.email());'],
  ['console.error is not captured', 'src/net/observability.js', "[S.captureConsoleIntegration({ levels: ['error'] })]", '[]'],
  ['the chat is not masked', 'src/shell/windows/chat.js', 'class="hc-chat ph-mask"', 'class="hc-chat"'],
  ['the CSP drops the PostHog host', 'play.html', ' https://us.i.posthog.com ', ' '],
  ['a starved live view goes unreported', 'src/net/observability.js', 'else if (w.open && w.running && !running && w.starvedAt === null)', 'else if (false)'],
  ['one error loops into Sentry', 'src/net/observability.js', 'if (n > limits.perFingerprint) { held++; return null; }', 'if (false) { held++; return null; }'],
  ['no ceiling per page load', 'src/net/observability.js', 'if (!hang && sent >= limits.perLoad)', 'if (false)'],
  ['network weather is sent', 'src/net/observability.js', 'if (WEATHER.some((r) => r.test(headline(event)))) return null;', ''],
  ['a hang is never reported', 'src/net/diagnostics.js', 'if (late > DIAG.HANG_MS) for', 'if (false) for'],
  ['a hidden tab counts as a hang', 'src/net/diagnostics.js', 'if (!visible() || late < DIAG.JANK_MS', 'if (late < DIAG.JANK_MS'],
  ['every stall sends a hang', 'src/net/observability.js', 'if (st.hung) return;', ''],
  ['a vendored SDK is swapped', 'src/net/observability-config.js', "integrity: 'sha384-yR8W", "integrity: 'sha384-xR8W"],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'observability: ' + fails.length + ' check(s) RED' : 'observability: both SDKs wired and masked on hearthrise.net; nothing loads or sends on localhost or with ?noanalytics=1; the named events and the live-view stall arrive; each error is sent at most 5 times and 25 in all; one hang message names the open hunt');
    process.exit(fails.length ? 1 : 0);
  }
  let bad = 0;
  const clean = await checks(null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  for (const [name, file, from, to] of MUTANTS) {
    const text = await readFile(join(ROOT, file), 'utf8');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
    const fails = await checks({ [file]: text.replace(from, to) });
    /* A harness failure is not the mutant's catch: it says nothing about the planted defect. */
    const harness = fails.filter((f) => f.startsWith('HARNESS'));
    if (harness.length) { console.log('  ✗ ' + name + ' — harness: ' + harness[0]); bad++; }
    else if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'observability --mutate: ' + bad + ' escaped' : 'observability --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}
main();
