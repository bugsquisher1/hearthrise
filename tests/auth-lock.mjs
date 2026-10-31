#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/auth-lock.mjs — THE REAL SUPABASE-JS, ITS LOCK, AND A TAB THAT NEVER LETS GO.
//
//   node tests/auth-lock.mjs           the checks
//   node tests/auth-lock.mjs --mutate  every planted defect must turn a check RED
//
// mutant-anchors: src/net/auth-lock.js src/net/auth.js src/net/supabase-bootstrap.js src/app/boot.js
//
// A real Chromium, the real play.html and the REAL vendored supabase-js (tests/client-boot.mjs stubs it, so it
// cannot see this): only the project's REST and auth answers are stubbed, with a refresh token that rotates the way the
// real one does (used twice = refused). Another page of the same browser profile holds 'lock:hr-auth' for ever
// with two more requests queued behind it: what QA found a frozen tab doing on live (v0.2.75, 1-3 forced steals a load).
//   AL-1  A SESSION THAT LASTS NEVER ASKS FOR THE LOCK: with the holder there, the roster is drawn, the page never requests
//         the Web Lock, and supabase-js never prints its 'was not released' warning, also after its 5 s timeout
//   AL-2  ONE REFRESHER ACROSS TABS: two tabs boot at once on a token in its refresh window: ONE refresh reaches
//         the server, none is refused, both draw the roster with the new token
//   AL-3  A STALE TOKEN BEHIND A STUCK HOLDER: the page waits supabase-js's timeout ONCE, takes the lock, refreshes once and
//         draws the roster; no supabase-js warning
//   AL-4  A FORCED REFRESH IS ONE AT A TIME TOO: two tabs both told 401 on a token whose expiry says it lasts: the two
//         refreshes reach the server in turn (each with the newest token), so neither is refused and nobody is signed out
//   AL-5  SIGN-OUT AND A DEAD SESSION STILL WORK, with the holder there: Sign out lands on the sign-in screen with no
//         copy of the session left; a refresh the server refuses lands there too
//   AL-6  THE LOCK ITSELF, on real Web Locks: a step whose lock is stolen keeps going and its answer stands; a busy lock
//         answers supabase-js's refresh tick (timeout 0) with what it skips on; the page's steps run one at a time; a
//         step that never ends does not stop the next one past its timeout
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { leaseBrowser } from './_chrome.mjs';
import { ROOT, UID, serve } from './_client-harness.mjs';
import { isMain } from './_is-main.mjs';

const KEY = 'hr-auth';
const LOCK = 'lock:' + KEY;
const PROJECT = 'https://nezapsylztqbbwuwembx.supabase.co/**';
const LASTING = 3600;
const IN_WINDOW = 30;       // seconds left: inside every margin, this load refreshes
const USER = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'qa@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
const sessionOf = (token, rt, left) => ({ access_token: token, refresh_token: rt, token_type: 'bearer', expires_in: left, expires_at: Math.floor(Date.now() / 1000) + left, user: USER });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* The project's answers. Refresh tokens rotate: each answers once, a second use is refused (the case that ends a session). */
function project(o = {}) {
  const st = { refreshes: [], refused: [], live: new Set(['rt-0']), n: 0, tokens: [], dead: new Set(o.dead || []), refuseAll: !!o.refuseAll, deadAsks: 0 };
  st.route = async (r) => {
    const req = r.request();
    const url = req.url();
    const json = (status, body) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {});
    if (/\/auth\/v1\/token/.test(url)) {
      const rt = JSON.parse(req.postData() || '{}').refresh_token;
      st.refreshes.push(rt);
      await sleep(o.refreshMs || 400);
      if (st.refuseAll || !st.live.has(rt)) { st.refused.push(rt); return json(400, { code: 400, error_code: 'refresh_token_already_used', msg: 'Invalid Refresh Token: Already Used' }); }
      st.live.delete(rt);
      const next = 'rt-' + (++st.n);
      st.live.add(next);
      return json(200, sessionOf('tok-' + st.n, next, LASTING));
    }
    if (/\/auth\/v1\/logout/.test(url)) return r.fulfill({ status: 204 }).catch(() => {});
    if (/\/rest\/v1\/rpc\//.test(url)) {
      const token = String(req.headers().authorization || '').replace(/^Bearer /, '');
      st.tokens.push(token);
      if (st.dead.has(token)) {
        /* o.together: the 401s go out together, so every tab told is refreshing at the same moment */
        st.deadAsks++;
        for (let i = 0; i < 300 && st.deadAsks < (o.together || 1); i++) await sleep(50);
        return json(401, { code: 'PGRST301', message: 'JWT expired' });
      }
      return json(200, { ok: true, version: 1, name: 'Lockfoot', state: { active_kind: 'idle', gold: 0, gold_v: 1, level_xp: 0 }, skills: {}, inventory: {}, hero_slots: [0], account: { max_concurrent: 4 } });
    }
    return json(200, { ok: true });
  };
  return st;
}

/* The asks and warnings of one page, from before its first script. */
const WATCH = `(() => {
  window.__asks = []; window.__warns = [];
  const real = navigator.locks.request.bind(navigator.locks);
  navigator.locks.request = function (name, ...rest) { window.__asks.push(name); return real(name, ...rest); };
  const warn = console.warn.bind(console);
  console.warn = (...a) => { window.__warns.push(String(a[0])); warn(...a); };
})();`;

const ROSTER = '.char-level';
const asksOf = (page) => page.evaluate((n) => window.__asks.filter((x) => x === n).length, LOCK);
const stealWarnings = (page) => page.evaluate(() => window.__warns.filter((w) => /was not released/.test(w)));

async function checks(overrides) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  /* One browser profile (one lock manager): `seed` is the stored session every page finds. */
  const profile = async (seed, o) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const stub = project(o);
    await ctx.route(PROJECT, stub.route);
    await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
    await ctx.addInitScript(WATCH);
    const first = await ctx.newPage();
    await first.goto(base + '/index.html', { waitUntil: 'load' });
    await first.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(seed)]);
    return { ctx, stub, holderPage: first };
  };
  /* What QA read off a frozen tab: the lock held, two more queued behind it, none ever to run. */
  const holdFor = (page) => page.evaluate((n) => {
    navigator.locks.request(n, () => new Promise(() => {}));
    navigator.locks.request(n, () => new Promise(() => {}));
    navigator.locks.request(n, () => new Promise(() => {}));
  }, LOCK);
  /* generous: a page is ~340 uncached modules, and a loaded runner's disk has stalled one past 30 s */
  const roster = (page, ms = 120000) => page.waitForSelector(ROSTER, { timeout: ms }).then(() => true, () => false);
  const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
  try {
    { // AL-1
      const { ctx, holderPage } = await profile(sessionOf('tok-0', 'rt-0', LASTING));
      await holdFor(holderPage);
      const page = await ctx.newPage();
      await page.goto(base + '/play.html', { waitUntil: 'commit' });
      if (!(await roster(page))) fails.push('AL-1 no roster behind the held lock');
      await sleep(6000);   // past supabase-js's own 5 s timeout: its refresh tick and its start-up have all run by now
      const asks = await asksOf(page);
      if (asks) fails.push('AL-1 a session that lasts asked for the Web Lock ' + asks + ' time(s)');
      const warns = await stealWarnings(page);
      if (warns.length) fails.push('AL-1 supabase-js forced the lock ' + warns.length + ' time(s)');
      await ctx.close();
    }
    { // AL-2
      const { ctx, stub, holderPage } = await profile(sessionOf('tok-0', 'rt-0', IN_WINDOW), { refreshMs: 1500 });
      const a = holderPage;
      const b = await ctx.newPage();
      await Promise.all([a.goto(base + '/play.html', { waitUntil: 'commit' }), b.goto(base + '/play.html', { waitUntil: 'commit' })]);
      const [ra, rb] = await Promise.all([roster(a), roster(b)]);
      if (!ra || !rb) fails.push('AL-2 a tab did not reach the roster (' + ra + ', ' + rb + ')');
      await sleep(800);
      if (stub.refreshes.length !== 1) fails.push('AL-2 ' + stub.refreshes.length + ' refreshes reached the server for one rotation: ' + stub.refreshes.join());
      if (stub.refused.length) fails.push('AL-2 a refresh was refused: ' + stub.refused.join());
      const got = await stored(a);
      if (!got || got.refresh_token !== 'rt-1') fails.push('AL-2 the store holds ' + (got && got.refresh_token));
      await ctx.close();
    }
    { // AL-3
      const { ctx, stub, holderPage } = await profile(sessionOf('tok-0', 'rt-0', IN_WINDOW));
      await holdFor(holderPage);
      const page = await ctx.newPage();
      await page.goto(base + '/play.html', { waitUntil: 'commit' });
      if (!(await roster(page))) fails.push('AL-3 no roster after a stale token behind the held lock');
      if (stub.refreshes.length !== 1 || stub.refused.length) fails.push('AL-3 refreshes ' + stub.refreshes.join() + ' refused ' + stub.refused.join());
      const sent = stub.tokens.filter((t) => t !== 'tok-1');
      if (sent.length) fails.push('AL-3 the stale token was sent: ' + sent.join());
      const warns = await stealWarnings(page);
      if (warns.length) fails.push('AL-3 supabase-js forced the lock ' + warns.length + ' time(s)');
      await ctx.close();
    }
    { // AL-4
      const { ctx, stub, holderPage } = await profile(sessionOf('tok-0', 'rt-0', LASTING), { dead: ['tok-0'], refreshMs: 500, together: 2 });
      const a = holderPage;
      const b = await ctx.newPage();
      await Promise.all([a.goto(base + '/play.html', { waitUntil: 'commit' }), b.goto(base + '/play.html', { waitUntil: 'commit' })]);
      const [ra, rb] = await Promise.all([roster(a), roster(b)]);
      if (!ra || !rb) fails.push('AL-4 a tab told 401 did not reach the roster (' + ra + ', ' + rb + ')');
      if (stub.refused.length) fails.push('AL-4 two tabs rotated one refresh token at once: refused ' + stub.refused.join() + ' of ' + stub.refreshes.join());
      await ctx.close();
    }
    { // AL-5: sign-out
      const { ctx, holderPage } = await profile(sessionOf('tok-0', 'rt-0', LASTING));
      await holdFor(holderPage);
      const page = await ctx.newPage();
      await page.goto(base + '/play.html', { waitUntil: 'commit' });
      if (!(await roster(page))) fails.push('AL-5 no roster');
      else {
        await page.click('[data-app="sign-out"]');
        const out = await page.waitForSelector('form[data-auth="sign-in"]', { timeout: 120000 }).then(() => true, () => false);
        if (!out) fails.push('AL-5 Sign out did not reach the sign-in screen');
        const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k === 'hr-auth' || k.startsWith('hr-auth-') || k.startsWith('sb-')));
        if (left.length) fails.push('AL-5 sign-out left ' + left.join());
      }
      await ctx.close();
    }
    { // AL-5: a dead session, refused at boot (the stale token) and under the game (a 401 whose refresh is refused)
      const { ctx } = await profile(sessionOf('tok-0', 'rt-0', IN_WINDOW), { refuseAll: true });
      const page = await ctx.newPage();
      await page.goto(base + '/play.html', { waitUntil: 'commit' });
      if (!(await page.waitForSelector('form[data-auth="sign-in"]', { timeout: 120000 }).then(() => true, () => false))) fails.push('AL-5 a refused refresh at boot did not reach the sign-in screen');
      await ctx.close();
      const under = await profile(sessionOf('tok-0', 'rt-0', LASTING), { dead: ['tok-0'], refuseAll: true });
      const p2 = await under.ctx.newPage();
      await p2.goto(base + '/play.html', { waitUntil: 'commit' });
      if (!(await p2.waitForSelector('form[data-auth="sign-in"]', { timeout: 120000 }).then(() => true, () => false))) fails.push('AL-5 a refused refresh after a 401 did not reach the sign-in screen');
      else {
        const left = await p2.evaluate(() => Object.keys(localStorage).filter((k) => k === 'hr-auth' || k.startsWith('sb-')));
        if (left.length) fails.push('AL-5 a dead session left ' + left.join());
      }
      await under.ctx.close();
    }
    { // AL-6
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(base + '/index.html', { waitUntil: 'load' });
      const out = await page.evaluate(async () => {
        const v = document.documentElement.outerHTML.match(/\?v=([\d.]+)/);
        const { createAuthLock } = await import('/src/net/auth-lock.js' + (v ? '?v=' + v[1] : ''));
        const res = {};
        const pause = (ms) => new Promise((r) => setTimeout(r, ms));
        const due = createAuthLock({ locks: navigator.locks, expiresAt: () => 0 });
        /* stolen mid-step: its answer stands */
        const held = due.lock('x', 2000, async () => { await pause(120); return 'mine'; });
        await pause(30);
        await navigator.locks.request('x', { steal: true }, async () => {});
        res.stolen = await held.catch((e) => 'threw ' + (e && e.name));
        /* a busy lock answers the tick with what it skips on */
        let release;
        const hold = navigator.locks.request('y', () => new Promise((r) => { release = r; }));
        await pause(20);
        res.tick = await due.lock('y', 0, async () => 'ran').catch((e) => (e && e.isAcquireTimeout ? 'skipped' : 'threw ' + e));
        release();
        await hold;
        /* the page's own steps: one at a time, in order, with no Web Lock at all when the session lasts */
        const lasting = createAuthLock({ locks: navigator.locks, expiresAt: () => Date.now() / 1000 + 3600 });
        const order = [];
        await Promise.all([
          lasting.lock('z', 2000, async () => { order.push('a+'); await pause(40); order.push('a-'); }),
          lasting.lock('z', 2000, async () => { order.push('b+'); order.push('b-'); }),
        ]);
        res.order = order.join();
        res.busyTick = await (async () => {
          const p = lasting.lock('z', 2000, () => pause(40));
          const t = await lasting.lock('z', 0, async () => 'ran').catch((e) => (e && e.isAcquireTimeout ? 'skipped' : 'threw'));
          await p;
          return t;
        })();
        /* a step that never ends does not end the page's auth */
        lasting.lock('z', 100, () => new Promise(() => {}));
        res.past = await Promise.race([lasting.lock('z', 100, async () => 'ran'), pause(2000).then(() => 'stuck')]);
        res.asked = lasting.stats().asked;
        return res;
      });
      if (out.stolen !== 'mine') fails.push('AL-6 a stolen step lost its answer: ' + out.stolen);
      if (out.tick !== 'skipped') fails.push('AL-6 a busy lock answered the tick with ' + out.tick);
      if (out.order !== 'a+,a-,b+,b-') fails.push('AL-6 the page\'s steps overlapped: ' + out.order);
      if (out.busyTick !== 'skipped') fails.push('AL-6 a tick joined a busy page queue: ' + out.busyTick);
      if (out.past !== 'ran') fails.push('AL-6 a step that never ends held the next: ' + out.past);
      if (out.asked !== 0) fails.push('AL-6 a lasting session asked the other tabs ' + out.asked + ' time(s)');
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  ['supabase-js keeps its own lock (AL-1)', 'src/net/supabase-bootstrap.js', 'detectSessionInUrl: true, lock }', 'detectSessionInUrl: true }'],
  ['a lasting session asks the other tabs (AL-1)', 'src/net/auth-lock.js', 'return o.locks && refreshDue() ? acrossTabs', 'return o.locks ? acrossTabs'],
  ['a refresh window takes no Web Lock (AL-2)', 'src/net/auth-lock.js', 'return o.locks && refreshDue() ? acrossTabs', 'return o.locks && false ? acrossTabs'],
  ['a stuck holder is never passed (AL-3)', 'src/net/auth-lock.js', "return o.locks.request(name, { mode: 'exclusive', steal: true }, hold);", "return o.locks.request(name, { mode: 'exclusive' }, hold);"],
  ['a forced refresh takes no Web Lock (AL-4)', 'src/net/auth-lock.js', 'if (forced > 0) return true;', ''],
  ['the forced refresh is not marked (AL-4)', 'src/net/auth.js', 'await forcedRefresh(() => auth.refreshSession())', 'await auth.refreshSession()'],
  ['a stolen step loses its answer (AL-6)', 'src/net/auth-lock.js', 'if (work) return work;', ''],
  ['a busy lock throws what the tick does not skip (AL-6)', 'src/net/auth-lock.js', 'e.isAcquireTimeout = true;', ''],
  ['a step that never ends holds the page (AL-6)', 'src/net/auth-lock.js', 'if (!(timeout > 0)) return prev;', 'return prev;'],
  ['the page\'s steps overlap (AL-6)', 'src/net/auth-lock.js', 'await turnOf(prev, timeout);', ''],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'auth-lock: ' + fails.length + ' check(s) RED' : 'auth-lock: a lasting session never asks for the lock, one refresher across tabs, a stuck holder is passed, sign-out and a dead session hold');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await checks(null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to] of MUTANTS) {
    const text = await readFile(join(ROOT, file), 'utf8');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
    const fails = await checks({ [file]: text.replace(from, to) });
    /* caught by the check it names: a slow machine turning some other check red proves nothing */
    const want = /\((AL-\d)\)$/.exec(name)[1];
    if (fails.some((f) => f.startsWith(want))) console.log('  ✓ ' + name + ' — caught');
    else { console.log('  ✗ ' + name + ' — NOT caught' + (fails.length ? ', only: ' + fails.join('; ') : '')); bad++; }
  }
  console.log(bad ? 'auth-lock --mutate: ' + bad + ' escaped' : 'auth-lock --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
