#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/_client-harness.mjs — THE STUBBED SERVER THE CLIENT PAGE RUNNERS SHARE.
//
// Not a guard: tests/client-boot.mjs and tests/hunt-screen.mjs import it.
//   serve(overrides)  a static server over the repo root; `overrides` maps a
//                     repo-relative path to replacement text (a planted mutant)
//   HR_SITE_ROOT=dist the same server over the built site (tools/build-site.mjs; smoke.yml built-site): what ships
//                     is what the page runner judged. A runner names source files; siteGlob() and builtFile() say where the build put them.
//                     A path the built site does not hold falls back to the source tree, for a runner's own direct
//                     import of one module; tests/ship-build.mjs SB-2 proves no built file ever names such a path.
//   SDK_STUB          the fake supabase-js (auth in the storage the client
//                     hands it, channels a test can push frames into)
//   UID               the stub user's id
// mutant-anchors: none — a helper, not a guard
// ════════════════════════════════════════════════════════════════════════
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
export const SITE_ROOT = process.env.HR_SITE_ROOT ? normalize(resolve(ROOT, process.env.HR_SITE_ROOT)) : ROOT;
const BUILT = SITE_ROOT === ROOT ? null : JSON.parse(readFileSync(join(SITE_ROOT, 'build-map.json'), 'utf8'));
/** Where a source file went in the built site: a module's chunk, a hashed copy's name, or itself (plain source; a file kept at its path). A prefix names a versioned file. */
export function builtFile(rel) {
  if (!BUILT) return rel;
  if (BUILT.modules[rel]) return BUILT.modules[rel];
  if (BUILT.files[rel]) return BUILT.files[rel];
  const prefixed = Object.keys(BUILT.files).find((k) => k.startsWith(rel));
  return prefixed ? BUILT.files[prefixed] : rel;
}
/** A Playwright glob for a source file's requests, wherever the build put it. */
export const siteGlob = (rel) => '**/' + builtFile(rel) + '*';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
export const UID = '11111111-2222-3333-4444-555555555555';

/* `api`: answers what it recognises itself (true when it did), for a test whose server must be real: a request a page leaves
   behind on its way out never reaches Playwright's routes (tests/client-boot.mjs B-18). */
export function serve(overrides, api) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        if (api && await api(req, res)) return;
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let f = normalize(join(SITE_ROOT, urlPath === '/' ? '/index.html' : urlPath));
        if (!f.startsWith(SITE_ROOT)) { res.writeHead(403).end(); return; }
        let info = await stat(f).catch(() => null);
        if (!info && SITE_ROOT !== ROOT) { f = normalize(join(ROOT, urlPath)); if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; } info = await stat(f).catch(() => null); }
        if (info && info.isDirectory()) f = join(f, 'index.html');
        const rel = (f.startsWith(SITE_ROOT) ? f.slice(SITE_ROOT.length + 1) : f.slice(ROOT.length + 1)).split('\\').join('/');
        const body = overrides && overrides[rel] !== undefined ? overrides[rel] : await readFile(f);
        res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
      } catch { res.writeHead(404).end('not found'); }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* The fake supabase-js. Its auth keeps the session in opts.auth.storage under opts.auth.storageKey
   (like the real one) plus one `sb-*` copy, so sign-out must clear what the client really leaves. */
export const SDK_STUB = `(function () {
  var UID = '${UID}';
  /* Private broadcast topics only (the game's frames and chat): channels[topic] = { events: { name: cb }, cb (the
     first handler), status (the subscribe callback) }. send(topic, payload, event) delivers one message to that
     event's handler (the first one when no event is named) and answers how many handlers took it; join(topic)
     replays SUBSCRIBED, the way a re-join after a drop reports it. */
  window.__hub = { channels: {},
    send: function (topic, payload, event) { var c = this.channels[topic]; var f = c && ((event && c.events[event]) || (!event && c.cb));
      if (f) f({ payload: payload }); return f ? 1 : 0; },
    join: function (topic) { var c = this.channels[topic]; if (c && c.status) c.status('SUBSCRIBED'); return !!(c && c.status); } };
  window.supabase = { createClient: function (url, key, opts) {
    var st = opts.auth.storage, sk = opts.auth.storageKey, cbs = [];
    function read() { var v = st.getItem(sk); return v ? JSON.parse(v) : null; }
    function fire(ev, s) { setTimeout(function () { cbs.forEach(function (f) { f(ev, s); }); }, 0); }
    if (/type=recovery/.test(location.hash)) {
      var rs = { access_token: 'jwt-recovery', user: { id: UID, email: 'qa@example.test' } };
      st.setItem(sk, JSON.stringify(rs)); fire('PASSWORD_RECOVERY', rs);
    }
    return {
      auth: {
        getSession: function () { return Promise.resolve({ data: { session: read() } }); },
        signInWithPassword: function (c) {
          var s = { access_token: 'jwt-' + c.email, user: { id: UID, email: c.email } };
          st.setItem(sk, JSON.stringify(s)); localStorage.setItem('sb-stub-auth-token', '1'); fire('SIGNED_IN', s);
          return Promise.resolve({ data: { session: s }, error: null });
        },
        signUp: function () { return Promise.resolve({ data: {}, error: null }); },
        resetPasswordForEmail: function () { return Promise.resolve({ error: null }); },
        updateUser: function () { return Promise.resolve({ data: {}, error: null }); },
        /* window.__refuseRefresh: the server refuses the refresh token (a session that has ended). */
        refreshSession: function () {
          if (window.__refuseRefresh) return Promise.resolve({ data: { session: null, user: null }, error: { name: 'AuthApiError', status: 400, message: 'Invalid Refresh Token' } });
          var s = Object.assign({}, read(), { access_token: 'jwt-refreshed' }); st.setItem(sk, JSON.stringify(s)); fire('TOKEN_REFRESHED', s);
          return Promise.resolve({ data: { session: s }, error: null });
        },
        signOut: function () { fire('SIGNED_OUT', null); return Promise.resolve({ error: null }); },
        onAuthStateChange: function (f) { cbs.push(f); return { data: { subscription: { unsubscribe: function () {} } } }; },
      },
      realtime: { setAuth: function () {} },
      channel: function (topic) {
        var hub = window.__hub;
        var slot = function () { return hub.channels[topic] = hub.channels[topic] || { events: {}, cb: null, status: null }; };
        var ch = { topic: topic, on: function (t, f, cb) {
            var c = slot(); if (f && f.event) c.events[f.event] = cb; if (!c.cb) c.cb = cb; return ch; },
          subscribe: function (cb) { slot().status = cb; setTimeout(function () { cb('SUBSCRIBED'); }, 0); return ch; } };
        return ch;
      },
      removeChannel: function (ch) { delete window.__hub.channels[ch.topic]; },
    };
  } };
})();`;

