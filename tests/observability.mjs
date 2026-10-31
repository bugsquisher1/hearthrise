#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/observability.mjs — ERRORS AND REPLAYS ARE WIRED, MASKED, AND OFF WHERE THEY MUST BE.
//
//   node tests/observability.mjs           the checks
//   node tests/observability.mjs --mutate  every planted defect must turn a check RED
//
// mutant-anchors: src/net/observability.js src/net/diagnostics.js src/net/observability-config.js src/app/boot.js src/shell/windows/chat.js src/shell/widgets/hunt-topbar.js src/shell/launcher.js play.html
//
// play.html in a real Chromium with the REAL vendored Sentry and PostHog SDKs,
// supabase-js and the REST paths stubbed (tests/_client-harness.mjs). The page is
// served AS https://hearthrise.net (a route onto the local server), so the host
// rule, the page's CSP and the SDKs' own requests are the shipped ones; the two
// ingest hosts are routed and recorded, nothing reaches the network.
//
//   OB-1  hearthrise.net: boot loads Sentry (PostHog after sign-in, OB-12) from our origin and inits them:
//         Sentry release = BUILD.version, environment production, every error
//         sampled, no tracing, no replay; PostHog identified_only, autocapture
//         and pageviews off, nothing kept on the device, every input masked,
//         .ph-mask text masked (PostHog itself starts once the account is known: OB-11)
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
//   OB-11 PostHog never mints an anonymous id (Andy's report #61, the SDK's own warning):
//         it does not start until the account id is known and starts WITH it as its
//         bootstrap distinct id (node: init options, no identify(), a second account
//         re-seeds it, nothing is sent between the two; browser, the real SDK: nothing
//         runs on the sign-in screen, its distinct id is the account id, every body it
//         posts carries only that id, no $identify / $anon_distinct_id, no [PostHog.js] warning;
//         and after a sign-out and a second sign-in in one load, on a fresh session)
//   OB-12 PostHog's script is not fetched on the sign-in screen (206 KB, opt-review
//         2026-10-28): only once the account id is known, on the next idle moment
//   OB-13 where a new player gets stuck (2026-10-31): RAGE and DEAD clicks are on and ordinary
//         clicks are not. (node) the SDK's options (autocapture for 'click' only, no pageviews or
//         heatmaps, every text masked, every input masked) and its one gate (before_send): $autocapture
//         never passes, a click event passes from the characters and game screens only, with an account,
//         20 of each kind per load; every event carries release = BUILD.version. (browser, the real SDK
//         with the project's real remote config) a rage click and a dead click arrive as the element's
//         tag and classes; no click in the chat mask, .ph-no-capture or a field does, and none carries
//         a button's text, a title, an aria-label, a value or a placeholder
//   OB-14 the funnel (display-only, each step once per its scope: observability.js header): signup_done
//         (a new account on the characters screen), first_town, first_hunt_left, first_sale,
//         first_gear_equipped, tutorial_card (from the shell's coach), level_reached, session_return;
//         hunt_ended carries reseeds_total (every reseed of the load, past live_view_stall's 50);
//         a step is sent once per scope, afresh for the next account, and a load sends at most 400 events
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
/* What the project's own /flags/?config=true and /array/<key>/config answer (read from the live endpoints 2026-10-31): the SDK's
   autocapture, and with it rage clicks, starts only once the server has said `autocapture_opt_out` (false = allowed); elements
   travel as one chain string. */
const PH_FLAGS = JSON.stringify({ featureFlags: {}, featureFlagPayloads: {}, errorsWhileComputingFlags: false, flags: {}, autocapture_opt_out: false,
  elementsChainAsString: true, captureDeadClicks: false, heatmaps: false, autocaptureExceptions: false });
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

/* Every distinct id the SDK posted: on an event (batch / snapshot) or at the top of a body (the flags call). */
const distinctIds = (events) => events.map((e) => e && (e.distinct_id !== undefined ? e.distinct_id : e.properties && e.properties.distinct_id)).filter((x) => x !== undefined);
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
  const seen = { scripts: [], sentry: [], posthog: [], events: [], errors: [], csp: [], warns: [], harness: [] };
  pg.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) seen.csp.push(m.text());
    if (m.type() === 'warning' && /^\[PostHog\.js\]/.test(m.text())) seen.warns.push(m.text());
  });
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
    /* A page loads hundreds of modules at once; on a busy box the one-thread static server falls behind its accept queue and the
       OS refuses a connect (ECONNREFUSED, measured 2026-10-31 on a loaded PC: 17 of 600 module fetches in an otherwise green run).
       That is the box, not the page: the connect is tried again, a few times, before it is a harness failure. */
    const f = (async () => {
      for (let i = 0; ; i++) {
        try { return await r.fetch({ url: base + new URL(r.request().url()).pathname }); } catch (e) {
          if (i >= 5 || closing || !/ECONNREFUSED|ECONNRESET/.test(String(e && e.message))) throw e;
          await new Promise((ok) => setTimeout(ok, 40 * (i + 1)));
        }
      }
    })();
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
    const path = new URL(req.url()).pathname;
    seen.posthog.push(path);
    seen.events.push(...posthogEvents(req).filter((e) => e && e.event));   // the flags call's body is no event
    return r.fulfill({ status: 200, contentType: 'application/json', body: path === '/flags/' || /^\/array\/[^/]+\/config$/.test(path) ? PH_FLAGS : '{}' });
  });
  let v = 0;
  await pg.route('https://nezapsylztqbbwuwembx.supabase.co/**', (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    /* a brand-new account: slot 0 is not named yet, so no hero exists (the roster the characters screen reads) */
    if (o.fresh && name === 'hr_load') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'needs_name', hero_slots: [0, 1], account: { max_concurrent: 4 } }) });
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

async function signIn(pg, reach = '[data-app="play"][data-slot="0"]') {
  await wait(pg, () => document.querySelector('form[data-auth="sign-in"]'));
  await pg.fill('input[name=email]', 'qa@example.test');
  await pg.fill('input[name=password]', 'not-a-real-password');
  await pg.click('.auth-submit');
  return wait(pg, (sel) => document.querySelector(sel), reach);
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
      /* Sentry is in; PostHog is NOT (OB-11, OB-12): its script waits for the account id, so the sign-in screen
         never downloads it (opt-review 2026-10-28: 206 KB of a first visit's 1.97 MB). */
      const up = await wait(pg, () => window.Sentry && window.Sentry.getClient && window.Sentry.getClient());
      if (!up) fails.push('OB-1 Sentry did not load on hearthrise.net (scripts: ' + seen.scripts.join(', ') + ')');
      else {
        await pg.evaluate(() => new Promise((r) => setTimeout(r, 500)));   // past an idle moment: nothing may follow
        const idle = await pg.evaluate(() => ({ sdk: typeof window.posthog }));
        if (idle.sdk !== 'undefined' || seen.scripts.some((x) => /posthog/.test(x))) fails.push('OB-12 the PostHog script loaded on the sign-in screen: ' + JSON.stringify([idle, seen.scripts]));
        if (seen.posthog.length) fails.push('OB-11 PostHog sent on the sign-in screen, before the account id was known: ' + JSON.stringify(seen.posthog));
        const c = await pg.evaluate(() => {
          const s = window.Sentry.getClient().getOptions();
          return { release: s.release, environment: s.environment, sampleRate: s.sampleRate, traces: s.tracesSampleRate, tracer: s.tracesSampler,
            replay: s.replaysSessionSampleRate, replayErr: s.replaysOnErrorSampleRate, pii: s.sendDefaultPii,
            integrations: (s.integrations || []).map((i) => i.name) };
        });
        if (c.release !== VERSION || c.environment !== 'production' || c.sampleRate !== 1) fails.push('OB-1 Sentry release/environment/sampling: ' + JSON.stringify([c.release, c.environment, c.sampleRate]));
        if (c.traces !== undefined || c.tracer !== undefined || c.integrations.some((n) => /BrowserTracing|Replay/.test(n)) || c.replay || c.replayErr || c.pii) fails.push('OB-1 Sentry tracing/replay/PII is on: ' + JSON.stringify(c));
        if (!c.integrations.includes('CaptureConsole')) fails.push('OB-1 Sentry does not capture console.error: ' + c.integrations.join(','));
      }
      if (seen.scripts.some((s) => !/^src\/vendor\/(sentry-browser-[\d.]+\.min|sentry-captureconsole-[\d.]+\.min|posthog-js-[\d.]+\.full\.no-external)\.js$/.test(s))) fails.push('OB-1 an SDK came from elsewhere: ' + seen.scripts.join(', '));
      if (!(await signIn(pg))) fails.push('OB-3 sign-in did not reach the characters screen');
      if (!(await wait(pg, () => window.posthog && window.posthog.__loaded))) fails.push('OB-11 PostHog did not start once the account was known');
      else {
        const c = await pg.evaluate(() => {
          const p = window.posthog.config;
          return { profiles: p.person_profiles, autocapture: p.autocapture, pageview: p.capture_pageview,
            maskInputs: p.session_recording && p.session_recording.maskAllInputs, maskText: p.session_recording && p.session_recording.maskTextSelector,
            external: p.disable_external_dependency_loading, rec: p.disable_session_recording, persistence: p.persistence,
            boot: p.bootstrap || null, id: window.posthog.get_distinct_id() };
        });
        /* autocapture is on for clicks alone, to raise rage clicks (OB-13); no pageviews */
        if (c.profiles !== 'identified_only' || !c.autocapture || JSON.stringify(c.autocapture.dom_event_allowlist) !== '["click"]' || c.pageview !== false || c.external !== true) fails.push('OB-1 PostHog profiles/autocapture/pageview/external: ' + JSON.stringify(c));
        if (c.maskInputs !== true || c.maskText !== '.ph-mask, input, textarea') fails.push('OB-1 PostHog replay masking: ' + JSON.stringify([c.maskInputs, c.maskText]));
        if (c.rec !== true) fails.push('OB-3 replay is on at the characters screen (it names the email)');
        if (c.persistence !== 'memory') fails.push('OB-1 PostHog keeps its ids on the device: persistence ' + c.persistence);
        if (!c.boot || c.boot.distinctID !== UID || c.boot.isIdentifiedID !== true || c.id !== UID) fails.push('OB-11 PostHog did not start with the account id as its distinct id: ' + JSON.stringify([c.boot, c.id]));
      }
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
      /* the stall as a task of the page's own (a timer), as a real one is: one run straight from the test's evaluate is no
         frame of the page's, and Chromium reports no Long Animation Frame for it */
      await pg.evaluate(() => new Promise((ok) => setTimeout(() => { const t = performance.now(); while (performance.now() - t < 4200) { /* the stall */ } ok(); }, 0)));
      const stalled = () => seen.sentry.filter((b) => /^The page stalled/.test(sentryLine(b))).map(sentryEvent);
      if (!(await until(() => stalled().length > 0))) fails.push('OB-10 a 4 s main-thread stall never reached Sentry');
      else {
        await pg.waitForTimeout(1500);
        const hang = stalled();
        const hunt = hang[0].extra && Array.isArray(hang[0].extra.hunts) ? hang[0].extra.hunts[0] : null;
        if (hang.length !== 1 || JSON.stringify(hang[0].fingerprint) !== '["main-thread-hang"]' || !hunt || hunt.hunt !== HUNT.hunt.hunt_id)
          fails.push('OB-10 the hang message: ' + hang.length + ' sent, fingerprint ' + JSON.stringify(hang[0].fingerprint) + ', hunt ' + JSON.stringify(hunt));
        /* Chromium names the frame that held it: the 4 s loop above, the script that ran it (Long Animation Frames) */
        const lf = (hang[0].extra && hang[0].extra.long_frames) || [];
        if (!(lf.length > 0 && lf[0].ms >= 4000 && /setTimeout/.test(lf[0].scripts) && !/sentry/i.test(lf[0].scripts)))
          fails.push('OB-10 the hang message does not name the frame that held the page and its own script: ' + JSON.stringify(lf).slice(0, 300));
      }
      if (!(await wait(pg, () => document.querySelector('[data-hs-widget="hunt-topbar"] [data-hs-act="leave"]:not([hidden])')))) fails.push('OB-4 the hunt never showed its Leave button');
      else await pg.click('[data-hs-widget="hunt-topbar"] [data-hs-act="leave"]');
      const ev = (n) => seen.events.find((e) => e && e.event === n);
      await until(() => ev('hunt_started') && ev('leave_hunt_clicked') && ev('hunt_ended') && ev('first_hunt_left') && ev('tutorial_card'), 12000);
      const st = ev('hunt_started');
      const en = ev('hunt_ended');
      if (process.env.OBS_DEBUG) console.log('pageA', JSON.stringify(seen.events.map((e) => e && [e.event, e.properties && e.properties.release, e.event === 'tutorial_card' ? [e.properties.card, e.properties.state] : undefined])));
      /* OB-13/14, the real SDK: every event it queued carries the release; the hero's first town, its first hunt left (with the
         reason) and the hunt's reseed total reach PostHog from the real server answers */
      const noRelease = seen.events.filter((e) => e && (!e.properties || e.properties.release !== VERSION));
      if (noRelease.length) fails.push('OB-13 an event carries no release (' + VERSION + '): ' + noRelease.slice(0, 3).map((e) => e.event).join(','));
      if (!ev('first_town') || ev('first_town').properties.slot !== 0) fails.push('OB-14 no first_town for the hero\'s first read: ' + JSON.stringify(ev('first_town') && ev('first_town').properties));
      const fl = ev('first_hunt_left');
      if (!fl || fl.properties.slot !== 0 || fl.properties.reason !== 'left') fails.push('OB-14 first_hunt_left: ' + JSON.stringify(fl && fl.properties));
      if (!en || !Number.isInteger(en.properties.reseeds_total)) fails.push('OB-14 hunt_ended carries no reseeds_total: ' + JSON.stringify(en && en.properties.reseeds_total));
      if (seen.events.filter((e) => e && e.event === 'first_town' && e.properties.slot === 0).length !== 1) fails.push('OB-14 first_town was sent more than once for one hero in one load');
      /* the coach's card, from the shell (launcher.js heldCard): shown as it appears, done as the next one takes over */
      const cards = seen.events.filter((e) => e && e.event === 'tutorial_card' && e.properties.slot === 0);
      if (!cards.some((e) => e.properties.state === 'shown' && /^[a-z0-9_]+$/.test(e.properties.card)) || cards.some((e) => !/^(shown|done)$/.test(e.properties.state)))
        fails.push('OB-14 tutorial_card: ' + JSON.stringify(cards.map((e) => [e.properties.card, e.properties.state])));
      if (!st || st.properties.hunt !== HUNT.hunt.hunt_id || st.properties.party_size !== HUNT.party.members.length || st.properties.density !== (HUNT.hunt_density ? (HUNT.hunt_density[HUNT.hunt.hunt_id] ?? 0) : null))
        fails.push('OB-4 hunt_started: ' + JSON.stringify(st && { hunt: st.properties.hunt, party: st.properties.party_size, density: st.properties.density }) + ' (events: ' + seen.events.map((e) => e && e.event).join(',') + ')');
      if (!ev('leave_hunt_clicked')) fails.push('OB-4 no leave_hunt_clicked');
      if (!en || en.properties.reason !== 'left' || en.properties.seconds !== 300) fails.push('OB-4 hunt_ended: ' + JSON.stringify(en && { reason: en.properties.reason, seconds: en.properties.seconds }));
      const mine = seen.events.filter((e) => e && /^(hunt_started|hunt_ended|leave_hunt_clicked)$/.test(e.event));
      if (mine.some((e) => e.properties.distinct_id !== UID)) fails.push('OB-4 an event is not keyed by the account id: ' + mine.map((e) => e.properties.distinct_id).join(','));
      if (seen.events.some((e) => e && /^\$(autocapture|pageview|pageleave)$/.test(e.event))) fails.push('OB-1 PostHog sent autocapture/pageview events');
      if (JSON.stringify(seen.events).includes('qa@example.test')) fails.push('OB-4 an event carries the email');
      /* OB-11, the real SDK: every body it posted (events, snapshots, flags) names only the account, nothing is
         identified or merged from an anonymous id, the named events build the person, and the SDK did not warn. */
      const ids = distinctIds(seen.events);
      if (!ids.length || ids.some((x) => x !== UID)) fails.push('OB-11 PostHog posted a distinct id that is not the account id: ' + JSON.stringify([...new Set(ids)]));
      if (JSON.stringify(seen.events).includes('$anon_distinct_id') || seen.events.some((e) => e && e.event === '$identify')) fails.push('OB-11 PostHog merged an anonymous id onto the person ($identify / $anon_distinct_id)');
      if (mine.some((e) => e.properties.$process_person_profile !== true)) fails.push('OB-11 a named event does not build the person profile: ' + JSON.stringify(mine.map((e) => e.properties.$process_person_profile)));
      if (seen.warns.length) fails.push('OB-11 PostHog warned: ' + seen.warns[0].slice(0, 200));
      if (seen.csp.length) fails.push('OB-2 the CSP blocked telemetry: ' + seen.csp[0].slice(0, 200));
      if (seen.errors.length) fails.push('OB-1..4 page errors: ' + seen.errors.slice(0, 2).join(' | '));
      await close();
    }

    { // OB-11: sign out and in again in one load; the real SDK is re-seeded with the account id, never left to mint one
      const { pg, seen, close } = await page(browser, 'http://127.0.0.1:' + port, { hunt: false });
      opened.push(seen);
      await pg.goto('https://hearthrise.net/play.html', { waitUntil: 'load' });
      const live = () => pg.evaluate(() => (window.posthog && window.posthog.__loaded ? { id: window.posthog.get_distinct_id(), session: window.posthog.get_session_id() } : null));
      if (!(await signIn(pg)) || !(await wait(pg, () => window.posthog && window.posthog.__loaded))) fails.push('OB-11 PostHog did not start at the first sign-in');
      else {
        const first = await live();
        await pg.click('[data-app="sign-out"]');
        if (!(await wait(pg, () => document.querySelector('form[data-auth="sign-in"]')))) fails.push('OB-11 sign-out did not reach the sign-in screen');
        else if (!(await signIn(pg))) fails.push('OB-11 the second sign-in did not reach the characters screen');
        else {
          const again = await live();
          if (!again || again.id !== UID || again.session === first.session) fails.push('OB-11 the second sign-in did not re-seed PostHog with the account id and a fresh session: ' + JSON.stringify([first, again]));
        }
        await until(() => seen.posthog.filter((p) => p === '/flags/').length >= 2, 8000);   // the start's flags call and the re-seed's, both posted
        if (distinctIds(seen.events).some((x) => x !== UID)) fails.push('OB-11 PostHog posted a distinct id that is not the account id around the second sign-in: ' + JSON.stringify([...new Set(distinctIds(seen.events))]));
        if (JSON.stringify(seen.events).includes('$anon_distinct_id') || seen.events.some((e) => e && e.event === '$identify')) fails.push('OB-11 the second sign-in merged an anonymous id onto the person');
        if (seen.warns.length) fails.push('OB-11 PostHog warned at the second sign-in: ' + seen.warns[0].slice(0, 200));
      }
      await close();
    }

    { // OB-13 .. OB-15: a brand-new account on the characters screen, the real SDK: the funnel's first step, rage and dead clicks only
      const { pg, seen, close } = await page(browser, 'http://127.0.0.1:' + port, { hunt: false, fresh: true });
      opened.push(seen);
      await pg.goto('https://hearthrise.net/play.html', { waitUntil: 'load' });
      if (!(await signIn(pg, '[data-app="create"][data-slot="0"]'))) fails.push('OB-14 a new account did not reach the characters screen');
      else if (!(await wait(pg, () => window.posthog && window.posthog.__loaded))) fails.push('OB-14 PostHog did not start for the new account');
      else {
        /* Probes in the page, none of them the game's: a plain button, the same inside the chat's mask, inside .ph-no-capture,
           a field, and a dead spot. Every word that must never leave the browser is a secret in the test's own words. */
        await pg.evaluate(() => {
          const host = document.createElement('div');
          host.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;display:flex;flex-direction:column;gap:8px;padding:8px;background:#222';
          host.innerHTML = '<button type="button" class="obs-ok" title="obs-title-secret" aria-label="obs-aria-secret">obs-text-secret</button>'
            + '<div class="ph-mask"><button type="button" class="obs-masked">obs-chat-secret</button></div>'
            + '<div class="ph-no-capture"><button type="button" class="obs-blocked">obs-blocked-secret</button></div>'
            + '<input class="obs-field" value="obs-value-secret" placeholder="obs-placeholder-secret">'
            + '<div class="obs-dead">obs-dead-text</div>'
            + '<div class="ph-mask"><div class="obs-dead-masked">obs-dead-chat-secret</div></div>';
          document.body.appendChild(host);
        });
        /* four clicks in the same spot in one go (Playwright's clickCount): a rage click by the SDK's own rule (3 within a second and 30 px) */
        if (process.env.OBS_DEBUG) await pg.evaluate(() => { const o = window.posthog.capture; window.__caps = []; window.posthog.capture = function (n) { window.__caps.push(n); return o.apply(this, arguments); }; });
        const burst = async (sel) => { await pg.click(sel, { clickCount: 4, delay: 0 }); await pg.waitForTimeout(1200); };
        await burst('.obs-masked');
        await burst('.obs-blocked');
        await burst('.obs-field');
        await burst('.obs-ok');
        await pg.click('.obs-dead-masked');
        await pg.waitForTimeout(3500);
        await pg.click('.obs-dead');
        const has = (n, cls) => seen.events.some((e) => e && e.event === n && JSON.stringify(e.properties).includes(cls));
        await until(() => has('$rageclick', 'obs-ok') && has('$dead_click', 'obs-dead') && seen.events.some((e) => e && e.event === 'signup_done'), 14000);
        if (!seen.events.some((e) => e && e.event === 'signup_done' && e.properties.distinct_id === UID)) fails.push('OB-14 signup_done never arrived for an account with no hero yet (events: ' + seen.events.map((e) => e && e.event).join(',') + ')');
        if (!has('$rageclick', 'obs-ok')) fails.push('OB-13 a rage click on the characters screen never reached PostHog (events: ' + seen.events.map((e) => e && e.event).join(',') + ')');
        if (!has('$dead_click', 'obs-dead')) fails.push('OB-13 a dead click on the characters screen never reached PostHog (events: ' + seen.events.map((e) => e && e.event).join(',') + ')');
        if (seen.events.some((e) => e && e.event === '$autocapture')) fails.push('OB-13 an ordinary click was sent ($autocapture)');
        for (const cls of ['obs-masked', 'obs-blocked', 'obs-field', 'obs-dead-masked']) if (seen.events.some((e) => e && /^\$(rageclick|dead_click|autocapture)$/.test(e.event) && JSON.stringify(e.properties).includes(cls)))
          fails.push('OB-13 a click inside ' + cls + ' (the chat mask, .ph-no-capture, a field) was sent');
        const clicks = seen.events.filter((e) => e && /^\$(rageclick|dead_click)$/.test(e.event));
        for (const secret of ['obs-text-secret', 'obs-title-secret', 'obs-aria-secret', 'obs-value-secret', 'obs-placeholder-secret', 'obs-dead-text', 'qa@example.test'])
          if (JSON.stringify(clicks).includes(secret)) fails.push('OB-13 a click event carries the page\'s words: ' + secret);
        if (process.env.OBS_DEBUG) console.log('paths', JSON.stringify([...new Set(seen.posthog)]), await pg.evaluate(() => { const a = window.posthog.autocapture; return JSON.stringify({ en: a && a.isEnabled, init: a && a._initialized, got: a && a._hasReceivedConfigResponse, dis: a && a._isDisabledServerSide, cfg: a && a._config }); }));
        if (process.env.OBS_DEBUG) console.log('caps', JSON.stringify(await pg.evaluate(() => ({ caps: window.__caps, keys: Object.keys(window.posthog).filter((k) => /auto|rage|dead/i.test(k)), rc: window.posthog.config.rageclick }))));
        if (process.env.OBS_DEBUG) console.log(JSON.stringify(seen.events.map((e) => e && [e.event, e.properties && e.properties.release])));
        if (process.env.OBS_DEBUG) console.log('chains', JSON.stringify(clicks.map((e) => [e.event, e.properties.$elements_chain, e.properties.$el_text, (e.properties.$elements || []).length, Object.keys(e.properties).filter((k) => !/^\$(os|browser|device|timezone|raw|screen|viewport|lib|sdk|time|insert|host|path|current|init|config|dead_click_)/.test(k))])));
      }
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
  const inits = [];
  const calls = { identify: 0, reset: [] };
  const sdk = { init: (key, o) => { inits.push(o); return sdk; }, capture: (n, p) => events.push([n, p]), identify() { calls.identify++; },
    reset: (o) => { calls.reset.push(o); }, startSessionRecording() {}, stopSessionRecording() {} };
  const messages = [];
  let opts = null;
  const sentry = { init(o) { opts = o; }, setUser() {}, captureException() {}, captureMessage: (m, c) => messages.push([m, c]),
    captureConsoleIntegration: () => ({ name: 'CaptureConsole' }) };
  const win = {
    location: { hostname: 'hearthrise.net', search: '', href: 'https://hearthrise.net/play.html' },
    performance: { now: () => clock }, addEventListener() {}, removeEventListener() {},
    setInterval: (fn, ms) => { timers[ms] = fn; return 1; },
    requestIdleCallback: (fn) => { idleQ.push(fn); return idleQ.length; },
    document: { visibilityState: 'visible', createElement: () => ({}), head: { appendChild(s) { if (/posthog/.test(s.src)) win.posthog = sdk; else win.Sentry = sentry; s.onload(); } } },
  };
  const idleQ = [];
  const obs = OBS.startObservability(win);
  const tick = timers[1000];
  const beat = timers[500];
  if (!obs.send || !tick || !beat || !opts) { fails.push('OB-7 the module did not start on hearthrise.net'); return fails; }
  /* OB-11 (node): both scripts are in, and PostHog still waits; it starts WITH the account id as its bootstrap
     distinct id (memory persistence kept) and nobody calls identify() to merge an anonymous one. */
  if (inits.length) fails.push('OB-11 PostHog started before the account id was known');
  if (win.posthog || idleQ.length) fails.push('OB-12 the PostHog script was asked for before the account id was known');
  obs.identify(UID);
  if (win.posthog) fails.push('OB-12 the PostHog script loaded inside the sign-in, not on the next idle moment');
  /* OB-11: the script now loads only after a sign-in (OB-12), so the one way it can land with NO account behind it is
     a sign-out while it is on its way: it must not start then (an anonymous id), only at the next sign-in. */
  obs.forget();
  for (const fn of idleQ.splice(0)) fn();
  if (!win.posthog) fails.push('OB-12 the PostHog script did not load on the idle moment after the sign-in');
  if (inits.length) fails.push('OB-11 PostHog started with no account behind it (signed out while its script loaded): ' + JSON.stringify(inits.map((o) => o.bootstrap)));
  obs.identify(UID);
  const boot = inits.length === 1 ? inits[0].bootstrap : null;
  if (!boot || boot.distinctID !== UID || boot.isIdentifiedID !== true || inits[0].persistence !== 'memory')
    fails.push('OB-11 PostHog did not start with the account id as its bootstrap distinct id: ' + JSON.stringify(inits.map((o) => [o.bootstrap, o.persistence])));
  if (calls.identify) fails.push('OB-11 identify() was called ' + calls.identify + ' time(s): it merges an anonymous id onto the person');
  let body = null;
  const cs = new CS.CharacterSession({ slot: 0, uid: UID, server: { rpc: async () => ({ ok: true, body }) }, setTimer: () => 0, clearTimer() {} });
  let running = true, holdsWorld = true;
  cs.live.running = () => running;
  cs.live.stalled = () => !running && holdsWorld;  // out of seeds it holds a world; switched away from it holds none
  body = envelope(1); await cs.load();
  body = huntBody(2, false); await cs.load();
  cs._emit('live');                               // the engine seeded (live-link.js emits 'live')
  clock += 4000; running = false; tick();         // it starves between answers: nothing is emitted
  clock += 2500; tick();
  clock += 500; running = true; cs._emit('live'); // the next start point lands
  const reseed = () => { cs.liveLink.stats.reseeds++; cs._emit('reseed'); };
  clock += 3000; reseed();
  clock += 1000; reseed();
  /* a catch-up restarts the drawing too and corrects nothing: its own kind, and a correction's clock runs on past it */
  clock += 500; cs._emit('reseed');
  clock += 500; cs.liveLink.lastDiff = { swing: 40, hunt: 'mill_cellar', count: 2, by: { 'peer.hp': 2 }, lines: ['peer:tank.hp 10|12'] }; cs.liveLink._diffOut = true; reseed();
  /* a viewed hero switched away from drops its engine (live-link.js off): no starve, whatever the time on the other hero */
  holdsWorld = false; running = false; tick();
  clock += 30000; running = true; holdsWorld = true; cs._emit('live');
  const stalls = events.filter(([n]) => n === 'live_view_stall').map(([, p]) => p);
  const want = [{ kind: 'starve', ms: 3000, reseeds: 0 }, { kind: 'reseed', ms: 3000, reseeds: 1 }, { kind: 'reseed', ms: 1000, reseeds: 2 },
    { kind: 'catchup', ms: 4500, reseeds: 2 }, { kind: 'reseed', ms: 1000, reseeds: 3 }];
  if (JSON.stringify(stalls) !== JSON.stringify(want)) fails.push('OB-7 live_view_stall sent ' + JSON.stringify(stalls) + ', want ' + JSON.stringify(want));
  const named = events.filter(([n]) => n === 'live_diverged').map(([, p]) => p);
  if (named.length !== 1 || named[0].count !== 2 || named[0].hunt !== 'mill_cellar' || named[0].by['peer.hp'] !== 2 || !named[0].version) fails.push('OB-7 a correction did not name what differed: ' + JSON.stringify(named));
  for (let i = 0; i < 80; i++) reseed();
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
    /* ...and what held the page (Sentry JAVASCRIPT-4B): its frames (none here: no Long Animation Frames in node), the long-task counts, the last warnings */
    if (!Array.isArray(c.extra.long_frames) || !c.extra.perf || !Number.isFinite(c.extra.perf.longTasks) || !Array.isArray(c.extra.recent))
      fails.push('OB-10 the hang message does not say what held the page: ' + JSON.stringify({ long_frames: c.extra.long_frames, perf: c.extra.perf, recent: c.extra.recent }));
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

  /* OB-14 (node): the funnel, read off the server's answers. The first read of a hero that never hunted is its first town; the
     hunt that ends is its first hunt left, and hunt_ended carries EVERY reseed this load saw (live_view_stall stopped at 50 of them). */
  const ev = (n) => events.filter(([x]) => x === n).map(([, p]) => p);
  const XP = await import(u('src/core/xp.js'));
  const more = (slot, read) => new CS.CharacterSession({ slot, uid: UID, server: { rpc: async () => ({ ok: true, body: read() }) }, setTimer: () => 0, clearTimer() {} });
  if (JSON.stringify(ev('first_town')) !== JSON.stringify([{ slot: 0 }])) fails.push('OB-14 first_town for a hero that never hunted: ' + JSON.stringify(ev('first_town')));
  body = huntBody(3, true); await cs.load();
  const over = ev('hunt_ended');
  /* 83 real reseeds this load (2 + 1 + the 80 in OB-7; the catch-up between them corrects nothing and is no reseed); live_view_stall stopped at 50 */
  if (over.length !== 1 || over[0].reseeds_total !== 83) fails.push('OB-14 hunt_ended reseeds_total (83 real reseeds this load, live_view_stall capped at 50): ' + JSON.stringify(over));
  if (JSON.stringify(ev('first_hunt_left')) !== JSON.stringify([{ slot: 0, reason: 'left', seconds: 300 }])) fails.push('OB-14 first_hunt_left: ' + JSON.stringify(ev('first_hunt_left')));
  body = huntBody(4, false); await cs.load(); cs._emit('reseed');
  body = huntBody(5, true); await cs.load();
  if (ev('first_hunt_left').length !== 1) fails.push('OB-14 first_hunt_left was sent for a second hunt');
  /* a hero that has hunted before: no first town, no first hunt left; its Level rising is a level reached, each Level once */
  let xp1 = XP.charXpForLevel(2);
  let v1 = 0;
  const hero1 = more(1, () => Object.assign(huntBody(++v1, true), { now: '2026-10-17T00:05:00Z', state: { active_kind: 'idle', gold: 0, level_xp: xp1 } }));
  await hero1.load();
  if (ev('first_town').length !== 1) fails.push('OB-14 first_town was sent for a hero with a hunt on record');
  xp1 = XP.charXpForLevel(3); await hero1.load(); await hero1.load();
  xp1 = XP.charXpForLevel(4); await hero1.load();
  xp1 = XP.charXpForLevel(2); await hero1.load();
  xp1 = XP.charXpForLevel(4); await hero1.load();
  if (JSON.stringify(ev('level_reached')) !== JSON.stringify([{ slot: 1, level: 3 }, { slot: 1, level: 4 }])) fails.push('OB-14 level_reached: ' + JSON.stringify(ev('level_reached')));
  /* a hero whose last hunt is over when first read: minutes since it ended, by the server's clock */
  const back = more(2, () => Object.assign(huntBody(1, true), { now: new Date(Date.parse('2026-10-17T00:05:00Z') + 90 * 60000).toISOString(), hunt_server_now_ms: Date.parse('2026-10-17T00:05:00Z') + 90 * 60000 }));
  await back.load();
  if (JSON.stringify(ev('session_return').filter((p) => p.slot === 2)) !== JSON.stringify([{ slot: 2, minutes: 90, reason: 'left' }])) fails.push('OB-14 session_return: ' + JSON.stringify(ev('session_return')));
  /* a sale and an equip the server confirmed (the account's intent ledger); a refused ask, and a Dispatch loot that sold nothing, are neither */
  await cs.intents.track('equip', async () => ({ ok: false, error: 'refused' }));
  await cs.intents.track('loot_dispatch', async () => ({ ok: true, dispatch: { stored: { stacks: 3 }, sold: { stacks: 0, gold: 0 } } }));
  if (ev('first_sale').length || ev('first_gear_equipped').length) fails.push('OB-14 a refused equip or a dispatch that sold nothing counted: ' + JSON.stringify([ev('first_sale'), ev('first_gear_equipped')]));
  await cs.intents.track('vendor_sell_many', async () => ({ ok: true }));
  await hero1.intents.track('equip', async () => ({ ok: true }));
  await cs.intents.track('equip', async () => ({ ok: true }));
  if (ev('first_sale').length !== 1 || ev('first_gear_equipped').length !== 1) fails.push('OB-14 first_sale / first_gear_equipped (once each per account): ' + JSON.stringify([ev('first_sale'), ev('first_gear_equipped')]));

  /* OB-11: sign out, then a second account in the same load: nothing leaves in between (no account, no
     distinct id), and the same instance is re-seeded with the new id (never a bare reset() to an anonymous id). */
  const UID2 = '00000000-0000-4000-8000-0000000000b2';
  obs.forget();
  const sent = events.length;
  obs.track('between_accounts', {});
  obs.identify(UID2);
  obs.track('second_account', {});
  const re = calls.reset;
  if (events.length !== sent + 1 || events[events.length - 1][0] !== 'second_account') fails.push('OB-11 an event left with no account behind it, or the second account\'s did not: ' + JSON.stringify(events.slice(sent).map(([n]) => n)));
  if (re.length !== 1 || !re[0] || !re[0].bootstrap || re[0].bootstrap.distinctID !== UID2 || re[0].bootstrap.isIdentifiedID !== true || inits.length !== 1 || calls.identify)
    fails.push('OB-11 the second account did not re-seed PostHog with its own id: ' + JSON.stringify([re, inits.length, calls.identify]));

  /* OB-13 (node): rage and dead clicks ONLY, masked and bounded. The options the SDK starts with, and the one gate every event it
     queues goes through (before_send): ordinary clicks never leave, a click event leaves from the characters and game screens
     only, with an account, CLICK_MAX of each kind; every event carries the release. */
  const o = inits[0];
  const skip = (c) => !!c && Array.isArray(c.css_selector_ignorelist) && ['.ph-no-capture', '.ph-mask', 'input', 'textarea'].every((s) => c.css_selector_ignorelist.includes(s));
  if (!o.rageclick || !skip(o.rageclick)) fails.push('OB-13 rage clicks are off, or do not skip .ph-mask / .ph-no-capture / fields: ' + JSON.stringify(o.rageclick));
  if (!o.capture_dead_clicks || !skip(o.capture_dead_clicks) || o.capture_dead_clicks.capture_dead_swipes !== false) fails.push('OB-13 dead clicks are off, or do not skip .ph-mask / .ph-no-capture / fields: ' + JSON.stringify(o.capture_dead_clicks));
  if (!o.autocapture || JSON.stringify(o.autocapture.dom_event_allowlist) !== '["click"]' || !['value', 'title', 'aria-label', 'placeholder'].every((a) => o.autocapture.element_attribute_ignorelist.includes(a)))
    fails.push('OB-13 autocapture is not limited to clicks without the attributes that hold words: ' + JSON.stringify(o.autocapture));
  if (o.mask_all_text !== true || o.capture_pageview !== false || o.capture_pageleave !== false || o.capture_heatmaps !== false || o.session_recording.maskAllInputs !== true)
    fails.push('OB-13 a click event may carry text, or pageviews/heatmaps are on: ' + JSON.stringify([o.mask_all_text, o.capture_pageview, o.capture_heatmaps]));
  const gate = typeof o.before_send === 'function' ? o.before_send : (e) => e;
  const via = (name, props) => gate({ event: name, properties: Object.assign({}, props) });
  if (via('$autocapture') !== null) fails.push('OB-13 an ordinary click ($autocapture) passed the gate');
  obs.screen('auth');
  if (via('$rageclick') !== null || via('$dead_click') !== null) fails.push('OB-13 a click event left from the sign-in screen');
  obs.screen('closed');
  if (via('$rageclick') !== null) fails.push('OB-13 a click event left from the closed notice');
  obs.screen('characters');
  const passed = via('$rageclick', { a: 1 });
  if (!passed || passed.properties.a !== 1 || passed.properties.release !== VERSION) fails.push('OB-13 a rage click on the characters screen did not pass with the release: ' + JSON.stringify(passed));
  obs.screen('game');
  let rageOut = 1, deadOut = 0;
  for (let i = 0; i < 40; i++) { if (via('$rageclick')) rageOut++; if (via('$dead_click')) deadOut++; }
  if (rageOut !== 20 || deadOut !== 20) fails.push('OB-13 CLICK_MAX is 20 of each kind per load, got ' + rageOut + ' rage and ' + deadOut + ' dead');
  const named = via('hunt_started', { hunt: 'x' });
  if (!named || named.properties.hunt !== 'x' || named.properties.release !== VERSION) fails.push('OB-13 an ordinary event does not carry the release: ' + JSON.stringify(named));
  if (!via('$snapshot', { s: 1 }) || via('$snapshot').properties.release !== VERSION) fails.push('OB-13 a replay snapshot was dropped or has no release');

  /* OB-14 (node): a funnel step is sent once per scope for an account, afresh for the next one; EVENT_MAX caps a load whatever loops. */
  const base = events.length;
  OBS.trackOnce('tutorial_card', { slot: 0, card: 'c1', state: 'shown' }, '0:c1:shown');
  OBS.trackOnce('tutorial_card', { slot: 0, card: 'c1', state: 'shown' }, '0:c1:shown');
  OBS.trackOnce('tutorial_card', { slot: 0, card: 'c1', state: 'done' }, '0:c1:done');
  if (events.length - base !== 2) fails.push('OB-14 a funnel step went out ' + (events.length - base) + ' times for 2 scopes');
  obs.forget();
  OBS.trackOnce('tutorial_card', { slot: 0, card: 'c1', state: 'shown' }, '0:c1:shown');
  if (events.length - base !== 2) fails.push('OB-14 a funnel step went out with no account behind it');
  obs.identify(UID);
  OBS.trackOnce('tutorial_card', { slot: 0, card: 'c1', state: 'shown' }, '0:c1:shown');
  if (events.length - base !== 3) fails.push('OB-14 the next account\'s funnel did not start afresh');
  /* ...and a Dispatch loot that sold stacks is the next account's first sale, as the shop's sale was the last one's */
  await cs.intents.track('loot_dispatch', async () => ({ ok: true, dispatch: { stored: { stacks: 1 }, sold: { stacks: 2, gold: 40 } } }));
  if (ev('first_sale').length !== 2) fails.push('OB-14 a Dispatch loot that sold stacks was not a first sale: ' + JSON.stringify(ev('first_sale')));
  for (let i = 0; i < 1000; i++) obs.track('loop_probe', { i });
  if (events.length !== 400) fails.push('OB-14 EVENT_MAX is 400 named events per load, got ' + events.length);
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
    const early = [...await hashChecks(root), ...await nodeChecks(root)];
    /* a planted defect the pinned hashes or the node arm already catch is caught: its browser run (about 100 s) would add nothing to the verdict */
    if (overrides && early.length) return early;
    return [...early, ...await browserChecks(overrides)];
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
  ['a starved live view goes unreported', 'src/net/observability.js', 'else if (w.open && w.running && !running && w.starvedAt === null && cs.live.stalled())', 'else if (false)'],
  ['a hero switched away from reads as a starve', 'src/net/observability.js', 'w.starvedAt === null && cs.live.stalled())', 'w.starvedAt === null)'],
  ['a catch-up reads as a correction from the server', 'src/net/observability.js', 'if (did !== w.reseedsSeen) {', 'if (true) {'],
  ['a correction goes out without what differed', 'src/net/observability.js', 'if (d) w.diverged(d);', ''],
  ['one error loops into Sentry', 'src/net/observability.js', 'if (n > limits.perFingerprint) { held++; return null; }', 'if (false) { held++; return null; }'],
  ['no ceiling per page load', 'src/net/observability.js', 'if (!hang && sent >= limits.perLoad)', 'if (false)'],
  ['the PostHog script loads at boot, on the sign-in screen', 'src/net/observability.js', '    else win.setTimeout(go, 0);\n  };\n', '    else win.setTimeout(go, 0);\n  };\n  loadPostHog();\n'],
  ['network weather is sent', 'src/net/observability.js', 'if (WEATHER.some((r) => r.test(headline(event)))) return null;', ''],
  ['a hang is never reported', 'src/net/diagnostics.js', 'if (late > DIAG.HANG_MS) for', 'if (false) for'],
  ['a hidden tab counts as a hang', 'src/net/diagnostics.js', 'if (!visible() || late < DIAG.JANK_MS', 'if (late < DIAG.JANK_MS'],
  ['every stall sends a hang', 'src/net/observability.js', 'if (st.hung) return;', ''],
  /* Sentry JAVASCRIPT-4B: the hang report names the frame that held the page, by the page's own script (OB-10). */
  ['the hang report names no frame', 'src/net/diagnostics.js', '      return loaf.filter((f) => f.at + f.ms >= from)', '      return [].filter((f) => f.at + f.ms >= from)'],
  ['the hang report reads its frames at once', 'src/net/observability.js', 'win.setTimeout(report, HANG_READ_MS);', 'report();'],
  ['Sentry wraps every callback again', 'src/net/observability.js', ".filter((i) => i && i.name !== 'BrowserApiErrors')", ''],
  ['a vendored SDK is swapped', 'src/net/observability-config.js', "integrity: 'sha384-yR8W", "integrity: 'sha384-xR8W"],
  ['PostHog starts without the account id as its distinct id', 'src/net/observability.js', 'bootstrap: { distinctID: uid, isIdentifiedID: true },', ''],
  ['identify() merges an anonymous id onto the person', 'src/net/observability.js', 'if (!ph) ph = phSdk.init(cfg.posthog.key, posthogOptions(cfg, win, st.uid, (event) => sdkGate(st, event))) || phSdk;',
    'if (!ph) { ph = phSdk.init(cfg.posthog.key, Object.assign(posthogOptions(cfg, win, st.uid, (event) => sdkGate(st, event)), { bootstrap: {} })) || phSdk; ph.identify(st.uid); }'],
  ['PostHog starts before the account is known', 'src/net/observability.js', 'if (!phSdk || !st.uid || phUid === st.uid) return;', 'if (!phSdk || (st.uid && phUid === st.uid)) return;'],
  ['sign-out resets PostHog to an anonymous id', 'src/net/observability.js', 'st.queue.length = 0;', 'st.queue.length = 0; if (ph) safe(() => ph.reset());'],
  ['an event leaves with no account behind it', 'src/net/observability.js', 'if (!st.uid) return;\n    const p = Object.assign', 'const p = Object.assign'],
  /* OB-13: rage and dead clicks, and only those, masked and bounded */
  ['rage clicks are off', 'src/net/observability.js', "rageclick: { css_selector_ignorelist: CLICK_SKIP.slice(), ignore_text_selection: true },", 'rageclick: false,'],
  ['dead clicks are off', 'src/net/observability.js', 'capture_dead_clicks: { css_selector_ignorelist: CLICK_SKIP.slice(), element_attribute_ignorelist: CLICK_ATTRS.slice(), capture_dead_swipes: false },', 'capture_dead_clicks: false,'],
  ['autocapture is off, so no rage click is ever raised', 'src/net/observability.js', "autocapture: { dom_event_allowlist: ['click'], element_attribute_ignorelist: CLICK_ATTRS.slice() },", 'autocapture: false,'],
  ['every ordinary click is sent', 'src/net/observability.js', "if (n === '$autocapture') return null;", ''],
  ['autocapture sees changes and submits too', 'src/net/observability.js', "autocapture: { dom_event_allowlist: ['click'],", 'autocapture: { dom_event_allowlist: undefined,'],
  ['a click event carries the button\'s text', 'src/net/observability.js', 'mask_all_text: true, before_send: gate,', 'before_send: gate,'],
  ['a click event carries titles, labels and values', 'src/net/observability.js', "const CLICK_ATTRS = ['value', 'placeholder', 'title', 'aria-label', 'alt', 'href', 'src', 'name'];", 'const CLICK_ATTRS = [];'],
  ['a click in the chat mask is sent', 'src/net/observability.js', "const CLICK_SKIP = ['.ph-no-capture', '.ph-mask', ", "const CLICK_SKIP = ['.ph-no-capture', "],
  ['a click in a field is sent', 'src/net/observability.js', "'input', 'textarea', 'select', '[contenteditable]'];", "'select'];"],
  ['a click is sent from the sign-in screen or with no account', 'src/net/observability.js', 'if (!st.uid || !CLICK_SCREENS.has(st.screen)) return null;', 'if (false) return null;'],
  ['the click kinds have no ceiling', 'src/net/observability.js', 'if (st.clicks[n] > CLICK_MAX) return null;', ''],
  ['the events carry no release', 'src/net/observability.js', 'if (event) event.properties = Object.assign({}, event.properties, { release: BUILD.version });', ''],
  /* OB-14: the funnel and its bounds */
  ['a load sends without end', 'src/net/observability.js', 'if (st.sent >= EVENT_MAX) return;', ''],
  ['a funnel step repeats', 'src/net/observability.js', 'if (!st.uid || st.onceKeys.has(key)) return;', 'if (!st.uid) return;'],
  ['the next account inherits the last one\'s funnel', 'src/net/observability.js', 'if (next !== st.uid) st.onceKeys.clear();', ''],
  ['hunt_ended counts no reseeds', 'src/net/observability.js', 'w.reseeds++; w.count();', 'w.reseeds++;'],
  ['hunt_ended counts a catch-up as a reseed', 'src/net/observability.js', "} else { w.stall('catchup', now - w.caughtAt); w.caughtAt = now; }", "} else { w.count(); w.stall('catchup', now - w.caughtAt); w.caughtAt = now; }"],
  ['hunt_ended drops the reseed total', 'src/net/observability.js', 'send(\'hunt_ended\', Object.assign({ reseeds_total: w.total() }, ended));', 'send(\'hunt_ended\', ended);'],
  ['first_town is never sent', 'src/net/observability.js', "if (!s) once('first_town', { slot }, 'town:' + slot);", "if (false) once('first_town', { slot }, 'town:' + slot);"],
  ['first_hunt_left is never sent', 'src/net/observability.js', "if (w.never) { w.never = false; send('first_hunt_left'", "if (false) { w.never = false; send('first_hunt_left'"],
  ['level_reached is never sent', 'src/net/observability.js', 'if (w.level !== null && lv.level > w.level) once(', 'if (false) once('],
  ['session_return is never sent', 'src/net/observability.js', "else if (s.ended && s.endedMs !== null && typeof cs.serverNow === 'function') {", 'else if (false) {'],
  ['first_sale is never sent', 'src/net/observability.js', "if (e.verb === 'vendor_sell_many' || (e.verb === 'loot_dispatch'", "if (e.verb === 'nothing' || (e.verb === 'loot_dispatch'"],
  ['a dispatch that sold nothing is a sale', 'src/net/observability.js', 'r.dispatch.sold && r.dispatch.sold.stacks > 0', 'r.dispatch'],
  ['first_gear_equipped is never sent', 'src/net/observability.js', "else if (e.verb === 'equip') once(", 'else if (false) once('],
  ['a refused ask counts as a step', 'src/net/observability.js', "const r = kind === 'end' && e.result && e.result.ok ? e.result : null;", "const r = kind === 'end' && e.result ? e.result : null;"],
  ['signup_done is never sent', 'src/app/boot.js', "if (roster.length && !rosterSlots.length) trackOnce('signup_done', {}, 'account');", ''],
  ['the coach\'s cards are never reported', 'src/shell/launcher.js', 'if (!had || had.card.id !== c.id) noteCard(cs, had ? had.card : null, c);', ''],
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
  /* --only=<pattern>: just the mutants whose name matches the regular expression (a way to re-prove a few after an edit; the sweep runs them all) */
  const onlyArg = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
  const only = onlyArg ? new RegExp(onlyArg, 'i') : null;
  for (const [name, file, from, to] of MUTANTS) {
    if (only && !only.test(name)) continue;
    const text = await readFile(join(ROOT, file), 'utf8');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
    const fails = await checks({ [file]: text.replace(from, to) });
    /* A harness failure is not the mutant's catch: it says nothing about the planted defect. */
    const harness = fails.filter((f) => f.startsWith('HARNESS'));
    if (harness.length) { console.log('  ✗ ' + name + ' — harness: ' + harness[0]); bad++; }
    else if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  const ran = only ? MUTANTS.filter(([name]) => only.test(name)).length : MUTANTS.length;
  console.log(bad ? 'observability --mutate: ' + bad + ' escaped' : 'observability --mutate: ' + ran + '/' + ran + ' mutants caught');
  process.exit(bad ? 1 : 0);
}
main();
