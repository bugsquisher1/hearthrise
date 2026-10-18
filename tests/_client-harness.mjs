#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/_client-harness.mjs — THE STUBBED SERVER THE CLIENT PAGE RUNNERS SHARE.
//
// Not a guard: tests/client-boot.mjs and tests/hunt-screen.mjs import it.
//   serve(overrides)  a static server over the repo root; `overrides` maps a
//                     repo-relative path to replacement text (a planted mutant)
//   SDK_STUB          the fake supabase-js (auth in the storage the client
//                     hands it, channels a test can push frames into)
//   UID               the stub user's id
// mutant-anchors: none — a helper, not a guard
// ════════════════════════════════════════════════════════════════════════
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
export const UID = '11111111-2222-3333-4444-555555555555';

export function serve(overrides) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let f = normalize(join(ROOT, urlPath === '/' ? '/index.html' : urlPath));
        if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        const info = await stat(f).catch(() => null);
        if (info && info.isDirectory()) f = join(f, 'index.html');
        const rel = f.slice(ROOT.length + 1).split('\\').join('/');
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
  window.__hub = { channels: {}, send: function (topic, payload) { var c = this.channels[topic]; if (c) c.cb({ payload: payload }); } };
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
        signOut: function () { fire('SIGNED_OUT', null); return Promise.resolve({ error: null }); },
        onAuthStateChange: function (f) { cbs.push(f); return { data: { subscription: { unsubscribe: function () {} } } }; },
      },
      realtime: { setAuth: function () {} },
      channel: function (topic) {
        var ch = { topic: topic, on: function (t, f, cb) { window.__hub.channels[topic] = { cb: cb }; return ch; },
          subscribe: function (cb) { setTimeout(function () { cb('SUBSCRIBED'); }, 0); return ch; } };
        return ch;
      },
      removeChannel: function (ch) { delete window.__hub.channels[ch.topic]; },
    };
  } };
})();`;

