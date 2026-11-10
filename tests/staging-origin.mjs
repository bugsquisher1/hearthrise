#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/staging-origin.mjs — A SITE PLAYS ITS OWN PROJECT, NEVER THE OTHER ONE (lane/a-staging).
//
//   node tests/staging-origin.mjs               the guard (pure rules, then the page in a browser)
//   node tests/staging-origin.mjs --no-page     the pure rules alone (no browser)
//   node tests/staging-origin.mjs --mutate      mutation proof: each planted defect must turn its rule red
//   node tests/staging-origin.mjs --shots <dir> also save the staging sign-in screen (desktop and phone) to <dir>
//
// mutant-anchors: src/net/supabase-bootstrap.js src/app/boot.js src/app/staging-mark.js supabase/functions/hr-accrue/cors.js supabase/functions/hr-accrue/index.ts play.html
// mutant-writes-tree: no — mutants are planted into temp copies and into the test's own static server
//
// WHY (2026-11-10). Staging is a second Supabase project that rehearses a release before players get it. The
// same client bytes serve both sites, and the same edge bundle runs on both projects, so which project a page
// or a function serves is decided where it RUNS. Two mistakes would be expensive: the live site reaching the
// staging project (players writing heroes into a database that gets thrown away), and a staging site reaching
// production (a rehearsal's half-built change run against real heroes).
//
//   SO-1   production's sites (and local dev, and a wrapper with no host) play production, staging wired or not
//   SO-2   a staging site plays the staging project, or nothing while that project is not wired. Never production
//   SO-3   a host that says staging and is not on the list plays nothing (http, a port, a lookalike, another domain)
//   SO-4   the label rule: every staging origin is https and carries `staging` in a label of its host; no production host does
//   SO-5   two different projects: production's is the ref the tools hold; staging's entry is all empty or all set
//   SO-6   play.html's connect-src lists exactly the wired projects (https and wss), no more and no fewer
//   SO-7   hr-accrue admits the staging site only when it runs off production: the same bundle, decided by its own project URL
//   SO-8   index.ts hands the function the platform's own project URL, nothing typed
//   SO-9   PAGE, staging site, project not wired: the mark, one plain card, and not one request to any project
//   SO-10  PAGE, staging site, wired: the mark and "nothing here is kept" on the sign-in screen; it reaches the
//          staging project (its CSP lets it) and never production
//   SO-11  PAGE, the live site, same bytes: no mark; it reaches production and never the staging project
//   SO-12  PAGE, a host that says staging and is not listed: nothing is sent anywhere
// Exit: 0 green · 1 a rule red · 2 harness error.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, SDK_STUB, serve } from './_client-harness.mjs';
import { isMain } from './_is-main.mjs';
import { scopedMutants } from '../tools/lib/mutant-scope.mjs';
import { PRODUCTION_REF } from '../tools/lib/env.mjs';
import { wireTexts } from '../tools/staging-bootstrap.local.mjs';

const BOOT = 'src/net/supabase-bootstrap.js';
const CORS = 'supabase/functions/hr-accrue/cors.js';
const INDEX = 'supabase/functions/hr-accrue/index.ts';
const PROD_URL = `https://${PRODUCTION_REF}.supabase.co`;
const STAGE_REF = 'stgprojectfakerefabc';
const STAGE_URL = `https://${STAGE_REF}.supabase.co`;
const STAGE_KEY = 'sb_publishable_FAKE_staging_key_000';
const read = (rel, over) => (over && over[rel] !== undefined ? over[rel] : readFileSync(join(ROOT, rel), 'utf8')).replace(/\r\n/g, '\n');

/** The client's bootstrap and the function's cors.js as modules: the repo's, or a temp copy of an override. */
async function load(over) {
  const dir = mkdtempSync(join(tmpdir(), 'hr-staging-origin-'));
  const place = (rel, text) => { const p = join(dir, rel); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, text); return import(pathToFileURL(p).href); };
  const boot = read(BOOT, over).replace(/from '\.\/auth-lock\.js\?v=[^']+'/, "from '" + pathToFileURL(join(ROOT, 'src/net/auth-lock.js')).href + "'");
  const wired = wireTexts(boot, read('play.html', over), STAGE_URL, STAGE_KEY);
  return {
    client: await place('as-is/bootstrap.mjs', boot),
    wired: await place('wired/bootstrap.mjs', wired.boot),
    cors: await place('cors.mjs', read(CORS, over)),
    wiredPlay: wired.play,
    drop() { try { rmSync(dir, { recursive: true, force: true }); } catch (e) { /* a temp dir */ } },
  };
}

const cspProjects = (play) => {
  const m = /connect-src ([^;]*);/.exec(play);
  return m ? m[1].split(/\s+/).filter((s) => /\.supabase\.co$/.test(s)).sort() : null;
};

async function pure(over) {
  const fails = [];
  const L = await load(over);
  try {
    const { client, wired, cors } = L;
    const playerHosts = [...(/playerHosts:\s*Object\.freeze\(\[([^\]]*)\]\)/.exec(read('src/session/config.js', over)) || ['', ''])[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    if (playerHosts.length < 2) fails.push('SO-1 the harness read no playerHosts from src/session/config.js');
    const PROD_SITES = [...playerHosts.map((h) => 'https://' + h), 'http://localhost:8123', 'http://127.0.0.1:5500', '', 'null', 'file://', 'capacitor://localhost', 'https://html-classic.itch.zone'];
    const LOOKALIKES = ['https://staging.hearthrise.net.evil.example', 'https://hearthrise-staging.pages.dev', 'https://staging.example.com',
      'http://staging.hearthrise.net', 'https://staging.hearthrise.net:8443', 'https://STAGING.hearthrise.net', 'https://my.staging-site.example'];

    for (const [label, mod] of [['not wired', client], ['wired', wired]]) {
      const P = mod.SUPABASE_ENVS.production;
      const S = mod.SUPABASE_ENVS.staging;
      for (const o of PROD_SITES) { // SO-1
        const c = mod.supabaseConfigFor(o);
        if (c.url !== PROD_URL || c.publishableKey !== P.publishableKey || c.env !== 'production') fails.push(`SO-1 (${label}) the site "${o}" does not play production: ${c.env} ${c.url || '(nothing)'}`);
      }
      for (const o of mod.STAGING_ORIGINS) { // SO-2
        const c = mod.supabaseConfigFor(o);
        if (c.url === PROD_URL || c.publishableKey === P.publishableKey) fails.push(`SO-2 (${label}) the staging site ${o} plays PRODUCTION`);
        else if (label === 'wired' ? (c.url !== STAGE_URL || c.publishableKey !== STAGE_KEY || c.env !== 'staging') : (c.url !== S.url || (!S.url && c.publishableKey !== '')))
          fails.push(`SO-2 (${label}) the staging site ${o} does not play ${label === 'wired' ? 'the staging project' : 'what its entry holds'}: ${c.env} ${c.url || '(nothing)'}`);
        /* half an entry is no project */
        for (const half of [{ url: STAGE_URL, publishableKey: '' }, { url: '', publishableKey: STAGE_KEY }]) {
          const h = mod.supabaseConfigFor(o, { production: P, staging: { env: 'staging', functionRegion: 'us-west-2', ...half } });
          if (h.url || h.publishableKey) fails.push(`SO-2 (${label}) half a staging entry was played: ${JSON.stringify(half)}`);
        }
      }
      for (const o of LOOKALIKES) { // SO-3
        const c = mod.supabaseConfigFor(o);
        if (c.url || c.publishableKey) fails.push(`SO-3 (${label}) "${o}" says staging, is not listed, and plays ${c.url}`);
      }
      // SO-5
      if (P.url !== PROD_URL) fails.push(`SO-5 (${label}) the client's production project is not the one the tools hold (${PRODUCTION_REF})`);
      if (!!S.url !== !!S.publishableKey) fails.push(`SO-5 (${label}) the staging entry is half set`);
      if (S.url && (S.url === P.url || S.publishableKey === P.publishableKey || !/^https:\/\/[a-z]{20}\.supabase\.co$/.test(S.url) || !/^sb_publishable_/.test(S.publishableKey))) fails.push(`SO-5 (${label}) the staging entry is not a second project with its own publishable key`);
      if (S.functionRegion !== P.functionRegion) fails.push(`SO-5 (${label}) staging is not in production's region`);
    }
    if (wired.SUPABASE_ENVS.staging.url !== STAGE_URL) fails.push('SO-5 the harness did not wire the staging entry');

    // SO-4
    if (!client.STAGING_ORIGINS.length) fails.push('SO-4 there is no staging origin');
    for (const o of client.STAGING_ORIGINS) {
      let u = null;
      try { u = new URL(o); } catch (e) { u = null; }
      if (!u || u.protocol !== 'https:' || u.origin !== o) fails.push(`SO-4 the staging origin ${o} is not a plain https origin`);
      else if (!client.isStagingHost(u.hostname)) fails.push(`SO-4 the staging origin ${o} does not carry "staging" in a label of its host`);
      if (playerHosts.includes(u ? u.hostname : '')) fails.push(`SO-4 ${o} is both a staging site and a production host`);
    }
    for (const h of playerHosts) if (client.isStagingHost(h)) fails.push(`SO-4 the production host ${h} says staging`);

    // SO-6
    for (const [label, play, mod] of [['not wired', read('play.html', over), client], ['wired', L.wiredPlay, wired]]) {
      const want = Object.values(mod.SUPABASE_ENVS).filter((e) => e.url).flatMap((e) => [e.url, e.url.replace(/^https:/, 'wss:')]).sort();
      const have = cspProjects(play);
      if (!have) fails.push(`SO-6 (${label}) play.html has no connect-src to read`);
      else if (have.join(' ') !== want.join(' ')) fails.push(`SO-6 (${label}) play.html's connect-src names [${have.join(' ')}], the client's projects are [${want.join(' ')}]`);
    }

    // SO-7
    const stageSite = client.STAGING_ORIGINS[0];
    if (JSON.stringify(cors.STAGING_ORIGINS) !== JSON.stringify([...client.STAGING_ORIGINS])) fails.push('SO-7 cors.js and the client list different staging sites');
    for (const url of [PROD_URL, PROD_URL + '/', client.SUPABASE_ENVS.production.url, '', undefined, null, 'https://evil.example', 'http://' + STAGE_REF + '.supabase.co', STAGE_URL + '.evil.example']) {
      if (cors.stagingOriginsFor(url).length) fails.push(`SO-7 a function at "${url}" admits the staging site`);
    }
    if (JSON.stringify(cors.stagingOriginsFor(STAGE_URL)) !== JSON.stringify(cors.STAGING_ORIGINS)) fails.push('SO-7 a function on the staging project does not admit the staging site');
    const ask = (handler, origin, method = 'OPTIONS') => handler(new Request(STAGE_URL + '/functions/v1/hr-accrue', { method, headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, apikey' } }));
    const ok = async () => new Response('{}', { status: 200 });
    for (const method of ['OPTIONS', 'POST']) {
      const onProd = await ask(cors.withCors(ok, { projectUrl: PROD_URL }), stageSite, method);
      const onStage = await ask(cors.withCors(ok, { projectUrl: STAGE_URL }), stageSite, method);
      const bare = await ask(cors.withCors(ok), stageSite, method);
      if (onProd.headers.get('access-control-allow-origin') !== null) fails.push(`SO-7 PRODUCTION's function answers the staging site's ${method} with Allow-Origin`);
      if (bare.headers.get('access-control-allow-origin') !== null) fails.push(`SO-7 a function that was told no project answers the staging site's ${method} with Allow-Origin`);
      if (onStage.headers.get('access-control-allow-origin') !== stageSite) fails.push(`SO-7 the staging function does not admit the staging site's ${method}`);
      for (const projectUrl of [PROD_URL, STAGE_URL]) {
        const game = await ask(cors.withCors(ok, { projectUrl }), 'https://hearthrise.net', method);
        if (game.headers.get('access-control-allow-origin') !== 'https://hearthrise.net') fails.push(`SO-7 the game's own origin lost its ${method} admission on ${projectUrl}`);
        const evil = await ask(cors.withCors(ok, { projectUrl }), 'https://staging.hearthrise.net.evil.example', method);
        if (evil.headers.get('access-control-allow-origin') !== null) fails.push(`SO-7 a lookalike of the staging site is admitted on ${projectUrl}`);
      }
    }

    // SO-8
    const index = read(INDEX, over);
    if (!/\n\}, \{ projectUrl: SUPABASE_URL \}\)\);\s*$/.test(index)) fails.push('SO-8 index.ts does not hand withCors the function\'s own project URL');
    if (!/const SUPABASE_URL = \(Deno\.env\.get\('SUPABASE_URL'\) \?\? ''\)/.test(index)) fails.push('SO-8 SUPABASE_URL is no longer the platform\'s own value');
  } catch (e) {
    fails.push('HARNESS ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  } finally { L.drop(); }
  return fails;
}

async function page(over, shots) {
  const fails = [];
  const { chromium } = await import('playwright');
  const { leaseBrowser } = await import('./_chrome.mjs');
  const { pinFonts } = await import('./_test-fonts.mjs');
  const boot = read(BOOT, over);
  const wired = wireTexts(boot, read('play.html', over), STAGE_URL, STAGE_KEY);
  const asIs = await serve(over || {});
  const wiredSrv = await serve({ ...(over || {}), [BOOT]: wired.boot, 'play.html': wired.play });
  const lease = await leaseBrowser(chromium);
  const wait = (pg, fn, arg, ms = 20000) => pg.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  async function open(site, port, viewport) {
    const ctx = await lease.newContext({ viewport: viewport || { width: 1280, height: 720 } });
    const pg = await ctx.newPage();
    const seen = { projects: [], csp: [], errors: [] };
    pg.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) seen.csp.push(m.text().slice(0, 160)); });
    pg.on('pageerror', (e) => seen.errors.push(String(e.message).slice(0, 160)));
    await pg.route(site + '/**', async (r) => {
      for (let i = 0; ; i++) {
        try { const res = await r.fetch({ url: 'http://127.0.0.1:' + port + new URL(r.request().url()).pathname }); return r.fulfill({ response: res }).catch(() => {}); }
        catch (e) { if (i >= 5 || !/ECONNREFUSED|ECONNRESET/.test(String(e && e.message))) return r.abort().catch(() => {}); await new Promise((k) => setTimeout(k, 40 * (i + 1))); }
      }
    });
    await pg.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
    await pinFonts(pg);
    await pg.route(/^(https|wss):\/\/[a-z0-9]+\.supabase\.co\//, (r) => {
      seen.projects.push(new URL(r.request().url()).host);
      const name = r.request().url().split('?')[0].split('/').pop();
      return r.fulfill({ contentType: 'application/json', body: name === 'hr_load' ? JSON.stringify({ ok: false, error: 'needs_name', hero_slots: [0, 1], account: { max_concurrent: 4 } }) : '{"ok":true}' }).catch(() => {});
    });
    await pg.goto(site + '/play.html?noanalytics=1', { waitUntil: 'load' });
    return { pg, seen, close: () => ctx.close() };
  }
  const markOf = (pg) => pg.evaluate(() => {
    const m = document.querySelector('.staging-mark');
    const note = m && m.querySelector('.staging-mark-note');
    /* the page's own layout with the mark and without it: the app's box and the document's height */
    const box = () => { const r = document.getElementById('app').getBoundingClientRect(); return [r.top, r.left, r.width, r.height, document.documentElement.scrollHeight].join(','); };
    const withMark = box();
    if (m) m.style.display = 'none';
    const without = box();
    if (m) m.style.display = '';
    return { mark: m ? m.querySelector('.staging-mark-name').textContent : null, note: note ? note.textContent : null, noteShown: !!note && getComputedStyle(note).display !== 'none',
      pressable: m ? getComputedStyle(m).pointerEvents !== 'none' : null, title: document.title, form: !!document.querySelector('form[data-auth]'), none: (document.querySelector('[data-no-server]') || {}).textContent || null,
      moved: withMark === without ? '' : withMark + ' vs ' + without };
  });
  const signIn = async (pg) => {
    await pg.fill('input[name=email]', 'qa@example.test');
    await pg.fill('input[name=password]', 'not-a-real-password');
    await pg.click('.auth-submit');
    return wait(pg, () => /Your characters/.test(document.body.textContent) && document.querySelector('.char-list'));
  };
  try {
    { // SO-9: the files as they are in the repo
      const { pg, seen, close } = await open('https://staging.hearthrise.net', asIs.port);
      const wiredInRepo = /staging: Object\.freeze\(\{ env: 'staging', url: 'https:/.test(boot);
      if (!wiredInRepo) {
        if (!await wait(pg, () => document.querySelector('[data-no-server]') || document.querySelector('form[data-auth]'))) fails.push('SO-9 the staging site drew nothing');
        await pg.waitForTimeout(400);
        const s = await markOf(pg);
        if (s.mark !== 'Staging') fails.push('SO-9 a staging site with no project wears no mark: ' + JSON.stringify(s.mark));
        if (!s.none || !/isn't connected to a server/.test(s.none) || s.form) fails.push('SO-9 a staging site with no project did not stop at the one plain card: ' + JSON.stringify([s.none, s.form]));
        if (seen.projects.length) fails.push('SO-9 a staging site with no project sent ' + seen.projects.length + ' request(s) to ' + [...new Set(seen.projects)].join(', '));
      }
      if (seen.errors.length) fails.push('SO-9 the page threw: ' + seen.errors[0]);
      await close();
    }
    { // SO-10
      const { pg, seen, close } = await open('https://staging.hearthrise.net', wiredSrv.port);
      if (!await wait(pg, () => document.querySelector('form[data-auth="sign-in"]'))) fails.push('SO-10 the wired staging site did not reach its sign-in screen');
      else {
        const s = await markOf(pg);
        if (s.mark !== 'Staging') fails.push('SO-10 the staging site wears no mark on its sign-in screen: ' + JSON.stringify(s.mark));
        if (!s.noteShown || !/Nothing you do here is kept/.test(s.note || '')) fails.push('SO-10 the sign-in screen does not say nothing here is kept: ' + JSON.stringify([s.note, s.noteShown]));
        if (s.pressable !== false) fails.push('SO-10 the mark can take a press meant for the game');
        if (s.moved) fails.push('SO-10 the mark changed the page\'s layout (staging must lay out as production does): ' + s.moved);
        if (s.title !== 'Hearthrise Staging') fails.push('SO-10 the tab is not named for staging: ' + s.title);
        if (shots) await pg.screenshot({ path: join(shots, 'staging-sign-in-desktop.png') });
        if (!await signIn(pg)) fails.push('SO-10 the staging site did not sign in and read its roster');
        await pg.waitForTimeout(300);
        const after = await markOf(pg);
        if (after.mark !== 'Staging' || !after.noteShown) fails.push('SO-10 the characters screen lost the mark or its note');
        if (shots) await pg.screenshot({ path: join(shots, 'staging-characters-desktop.png') });
        const hosts = [...new Set(seen.projects)];
        if (!hosts.includes(STAGE_REF + '.supabase.co')) fails.push('SO-10 the staging site never reached the staging project: [' + hosts.join(', ') + ']');
        if (hosts.some((h) => h !== STAGE_REF + '.supabase.co')) fails.push('SO-10 the staging site reached another project: [' + hosts.join(', ') + ']');
        if (seen.csp.length) fails.push('SO-10 the page\'s own CSP blocked it: ' + seen.csp[0]);
      }
      if (seen.errors.length) fails.push('SO-10 the page threw: ' + seen.errors[0]);
      await close();
      if (shots) {
        const phone = await open('https://staging.hearthrise.net', wiredSrv.port, { width: 667, height: 375 });
        await wait(phone.pg, () => document.querySelector('form[data-auth="sign-in"]'));
        await phone.pg.screenshot({ path: join(shots, 'staging-sign-in-phone.png') });
        await phone.close();
      }
    }
    { // SO-11: the live site on the SAME wired bytes
      const { pg, seen, close } = await open('https://hearthrise.net', wiredSrv.port);
      if (!await wait(pg, () => document.querySelector('form[data-auth="sign-in"]'))) fails.push('SO-11 the live site did not reach its sign-in screen');
      else {
        const s = await markOf(pg);
        if (s.mark !== null) fails.push('SO-11 the LIVE site wears the staging mark');
        if (s.title !== 'Hearthrise') fails.push('SO-11 the live site\'s tab name changed: ' + s.title);
        if (!await signIn(pg)) fails.push('SO-11 the live site did not sign in and read its roster');
        await pg.waitForTimeout(300);
        const hosts = [...new Set(seen.projects)];
        if (!hosts.includes(PRODUCTION_REF + '.supabase.co')) fails.push('SO-11 the live site never reached production: [' + hosts.join(', ') + ']');
        if (hosts.some((h) => h !== PRODUCTION_REF + '.supabase.co')) fails.push('SO-11 the LIVE site reached another project: [' + hosts.join(', ') + ']');
      }
      if (seen.errors.length) fails.push('SO-11 the page threw: ' + seen.errors[0]);
      await close();
    }
    { // SO-12
      const { pg, seen, close } = await open('https://staging.example.com', wiredSrv.port);
      if (!await wait(pg, () => document.querySelector('[data-no-server]') || document.querySelector('form[data-auth]'))) fails.push('SO-12 the unlisted staging host drew nothing');
      await pg.waitForTimeout(400);
      const s = await markOf(pg);
      if (!s.none || s.form) fails.push('SO-12 a host that says staging and is not listed did not stop at the plain card');
      if (seen.projects.length) fails.push('SO-12 a host that says staging and is not listed reached ' + [...new Set(seen.projects)].join(', '));
      await close();
    }
  } catch (e) {
    fails.push('HARNESS ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  } finally {
    await lease.close();
    asIs.server.close();
    wiredSrv.server.close();
  }
  return fails;
}

/* [name, file, from, to]. `page: true` on the two whose rule is a page rule. */
const MUTANTS = [
  ['the live site plays the staging project (SO-1)', BOOT, "return isStagingHost(host) ? 'unknown' : 'production';", "return isStagingHost(host) ? 'unknown' : 'staging';"],
  ['a staging site falls back to production (SO-2)', BOOT, 'return c && c.url && c.publishableKey ? c : NO_PROJECT(env);', 'return c && c.url && c.publishableKey ? c : envs.production;'],
  ['half a staging entry is played (SO-2)', BOOT, 'return c && c.url && c.publishableKey ? c : NO_PROJECT(env);', 'return c ? c : NO_PROJECT(env);'],
  ['a staging site is not on the list (SO-2)', BOOT, "if (STAGING_ORIGINS.includes(o)) return 'staging';", ''],
  ['an unlisted staging host plays production (SO-3)', BOOT, "return isStagingHost(host) ? 'unknown' : 'production';", "return 'production';"],
  ['a staging site with no staging in its name (SO-4)', BOOT, "export const STAGING_ORIGINS = Object.freeze(['https://staging.hearthrise.net']);", "export const STAGING_ORIGINS = Object.freeze(['https://beta.hearthrise.net']);"],
  ['the client names another production project (SO-5)', BOOT, "url: 'https://nezapsylztqbbwuwembx.supabase.co',", "url: 'https://nezapsylztqbbwuwembxx.supabase.co',"],
  ['play.html lets the page reach a stray project (SO-6)', 'play.html', 'wss://nezapsylztqbbwuwembx.supabase.co', 'wss://nezapsylztqbbwuwembx.supabase.co wss://strayprojectrefabcde.supabase.co'],
  ['production\'s function admits the staging site (SO-7)', CORS, 'if (!PROJECT_URL_RE.test(url) || url === PRODUCTION_PROJECT_URL) return [];', 'if (!PROJECT_URL_RE.test(url)) return [];'],
  ['a function with no project admits the staging site (SO-7)', CORS, 'if (!PROJECT_URL_RE.test(url) || url === PRODUCTION_PROJECT_URL) return [];', 'if (url === PRODUCTION_PROJECT_URL) return [];'],
  ['the staging site is admitted by prefix (SO-7)', CORS, 'return ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN_RE.test(origin) || extra.includes(origin);', 'return ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN_RE.test(origin) || extra.some((e) => origin.startsWith(e));'],
  ['the preflight forgets the staging site (SO-7)', CORS, "if (req.method === 'OPTIONS') return preflightResponse(req, extra);", "if (req.method === 'OPTIONS') return preflightResponse(req);"],
  ['index.ts never tells the function its project (SO-8)', INDEX, '}, { projectUrl: SUPABASE_URL }));', '}));'],
  ['a page with no project starts a client anyway (SO-12)', 'src/app/boot.js', 'if (!SUPABASE_CONFIG.url) { renderNoServer(root); return { auth: null, account: () => null }; }', '', true],
  ['a staging site wears no mark (SO-10)', 'src/app/boot.js', "if (SUPABASE_CONFIG.env !== 'production') mountStagingMark(doc);", '', true],
  ['the mark takes room on the page (SO-10)', 'src/styles/app.css', 'position: fixed; top: 4px; left: 50%; transform: translateX(-50%); z-index: 70; pointer-events: none;', 'pointer-events: none;', true],
];

async function main() {
  const argv = process.argv.slice(2);
  const noPage = argv.includes('--no-page');
  const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
  const exitOf = (fails) => (fails.some((f) => f.startsWith('HARNESS')) ? 2 : fails.length ? 1 : 0);
  if (!argv.includes('--mutate')) {
    const fails = [...await pure(null), ...(noPage ? [] : await page(null, shots))];
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'staging-origin: ' + fails.length + ' check(s) RED'
      : 'staging-origin: a site plays its own project and never the other one' + (noPage ? ' (SO-1..SO-8; the page rules were not run)' : ' (SO-1..SO-12)'));
    process.exit(exitOf(fails));
  }
  /* A gated push proves only the mutants its diff touches (tools/lib/mutant-scope.mjs); the nightly proves them all. */
  const MINE = scopedMutants('tests/staging-origin.mjs', MUTANTS);
  if (!MINE.length) process.exit(0);
  const needPage = MINE.some((m) => m[4]);
  const clean = [...await pure(null), ...(needPage ? await page(null, null) : [])];
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(exitOf(clean) || 1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to, onPage] of MINE) {
    const text = read(file);
    if (text.split(from).length !== 2) { console.log('  ✗ ' + name + ' — anchor not found exactly once in ' + file); bad++; continue; }
    const over = { [file]: text.replace(from, () => to) };
    const fails = onPage ? await page(over, null) : await pure(over);
    /* caught by the rule it names: some other rule going red proves nothing about this one */
    const want = /\((SO-\d+)\)$/.exec(name)[1];
    if (fails.some((f) => f.startsWith(want + ' '))) console.log('  ✓ ' + name + ' — caught');
    else { console.log('  ✗ ' + name + ' — NOT caught' + (fails.length ? ', only: ' + fails.join('; ').slice(0, 300) : '')); bad++; }
  }
  console.log(bad ? 'staging-origin --mutate: ' + bad + ' escaped' : 'staging-origin --mutate: ' + MINE.length + '/' + MINE.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
