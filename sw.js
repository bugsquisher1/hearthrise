/* sw.js — THE WORKER THAT KEEPS THE SITE'S VERSIONED FILES. Registered by src/platform/sw-killswitch.js, on the production origin only,
 * for play.html only. It lives at the root because a worker controls nothing above its own folder.
 *
 * WHY IT EXISTS: GitHub Pages sends max-age=600 and nothing can change that, while every file here is named for good by its version
 * query. Back after ten minutes, a browser asks again about all ~400 files: per file a disk read, a CDN whose copy ran out on the same
 * clock, a disk write, and for a quarter of them the whole file again, because Pages' servers stamp the same file a second apart. So a
 * semi-idle game's main moment hangs on the player's disk, CPU and line: the numbers and the proof are in tests/return-load.mjs.
 *
 * ONE RULE: a same-origin GET whose version query is THIS worker's version comes from the cache, else from the network and is then
 * kept. Everything else is not its business: page HTML, Google Fonts, Supabase, Sentry, PostHog, any other version. It never sees game
 * state, because it never answers for another host. The version is read from this file's own URL (no number in this text for a bump to
 * move), the cache is named after it, and a new release's page asks for a new worker, whose activation deletes the caches before it.
 *
 * A FAILURE IS THE NETWORK'S TURN, NEVER A BLANK PAGE: a storage error or a storage that does not answer falls through to the network;
 * only a whole 200 from this site is ever kept.
 *
 * THE BRAKE: src/platform/sw-killswitch.js (never served from here, so the brake does not depend on what it brakes). */
'use strict';

const VERSION = new URL(self.location.href).searchParams.get('v') || '';
const CACHE = 'hearthrise-' + VERSION;
const HOME = new URL('play.html', self.location.href).href;
const BRAKE = new URL('src/platform/sw-killswitch.js', self.location.href).pathname;
/* When this release went up, kept beside its files under a name no request can carry a version on. */
const RELEASE_KEY = new URL('release-stamp', self.location.href).href;
const FILL_AT_ONCE = 6;          // the first fill runs behind a page the player is using
const STORE_PATIENCE_MS = 8000;  // hung, not busy: on a busy disk the network path is slower still (it reads and writes the same disk)

/* ONE DEPLOY STAMPS ITS FILES OVER A FEW SECONDS (live 2026-11-04: 1 s apart). A file stamped this long before its own page's stamp came
   from an older deploy: a CDN or origin answered a new version with old bytes in the minutes around a release. The browser's own
   ten-minute copy of such a file heals by itself; kept here it would stay until the next release, so it is not kept. */
const DEPLOY_SPREAD_MS = 10 * 60 * 1000;

/* WHICH FILES THIS WORKER MAY KEEP AND ANSWER: this function, and nothing else decides it (the fill, the fetch handler). MAYBE_KEPT is the same
   rule for the browser's router, which only needs to be coarser: anything it lets through still has to pass isKept. A change of naming (hashed
   file names, say) changes these two lines and the guard's RL-4. */
const MAYBE_KEPT = { search: 'v=*' };
function isKept(url) {
  return url.origin === self.location.origin && url.searchParams.get('v') === VERSION && url.pathname !== BRAKE;
}

/* One handle per run of this worker: after a wipe it can write nowhere a page can find, where asking again by name would bring the cache back. */
let opened = null;
function openCache() {
  if (!opened) opened = caches.open(CACHE).catch((e) => { opened = null; throw e; });
  return opened;
}

let stamp = null;
function releaseStamp(cache) {
  if (!stamp) stamp = cache.match(RELEASE_KEY).then((r) => (r ? r.text() : '')).then(Date.parse);
  return stamp;
}

async function keep(cache, key, res) {
  if (res.status !== 200 || res.type !== 'basic' || res.redirected) return;
  const wrote = Date.parse(res.headers.get('last-modified'));
  if (wrote < (await releaseStamp(cache)) - DEPLOY_SPREAD_MS) return;
  await cache.put(key, res);
}

/* The files the page names, from the browser's own copies where it has them: the page that registered this worker has just loaded them,
   and nobody should wait for a second download or a second question about them. One that fails is simply fetched when a page asks. */
async function fill() {
  const res = await fetch(HOME);
  if (!res.ok) throw new Error('the page did not answer: ' + res.status);
  const urls = new Set();
  for (const m of (await res.clone().text()).matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = new URL(m[1], HOME);
    if (isKept(url)) urls.add(url.href);
  }
  /* A CDN answered with a page at another version: not ready. This install fails; the next page load registers again. */
  if (!urls.size) throw new Error('the page names no file at ' + VERSION);
  const cache = await openCache();
  await cache.put(RELEASE_KEY, new Response(res.headers.get('last-modified') || ''));
  const todo = [...urls];
  await Promise.all(Array.from({ length: FILL_AT_ONCE }, async () => {
    while (todo.length) {
      const url = todo.pop();
      try {
        if (!(await cache.match(url, { ignoreVary: true }))) await keep(cache, url, await fetch(url, { cache: 'force-cache' }));
      } catch (e) { /* its turn comes when a page asks */ }
    }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    /* Where the browser can (Chrome): what this worker never answers does not even wake it. Everywhere else the fetch handler's own test says the same. */
    try {
      if (event.addRoutes) await event.addRoutes([{ condition: { not: { urlPattern: new URLPattern(MAYBE_KEPT) } }, source: 'network' }]);
    } catch (e) { /* an older browser's router: the fetch handler answers */ }
    await fill();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE && /^(hearthrise|hearthbound)-/.test(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

function inTime(asked) {
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(resolve, STORE_PATIENCE_MS, null); });
  return Promise.race([asked, late]).finally(() => clearTimeout(timer));
}

async function answer(event) {
  const req = event.request;
  let cache = null;
  let missing = false;   // the storage answered that it does not hold this file: the only time there is something to keep
  try {
    cache = await inTime(openCache());
    const hit = cache && await inTime(cache.match(req, { ignoreVary: true }));
    if (hit) return hit;
    missing = hit === undefined;
  } catch (e) { /* storage trouble: the network's turn */ }
  const res = await fetch(req);
  if (missing) event.waitUntil(keep(cache, req, res.clone()).catch(() => {}));
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  /* A page's HTML is never answered here, whatever its query; a request asking for a fresh copy (or part of a file) gets exactly that. */
  if (req.method !== 'GET' || req.mode === 'navigate' || req.headers.has('range')) return;
  if (req.cache === 'no-store' || req.cache === 'reload' || req.cache === 'no-cache') return;
  if (isKept(new URL(req.url))) event.respondWith(answer(event));
});
