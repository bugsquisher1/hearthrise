// ════════════════════════════════════════════════════════════════════════
// src/app/boot.js — THE CLIENT'S ENTRY (play.html).
//
//   boot → auth (src/net/auth.js over the one supabase-js client)
//        → AccountSession (src/session/account-session.js): one per login
//        → the characters screen: the account's slots, read from the server
//        → the game: a strip of the open characters (up to the config's
//          maximum, each its own CharacterSession) and the World pane with the
//          shell over it for the character the strip shows (src/app/world-pane.js)
//
// Which open character is SHOWN is a view choice held here and nowhere else;
// it is never a "current player" any module reads. A reload signs back in from
// the stored session and starts at the characters screen.
//
// THE CLOSED GAME: the server refuses a non-allowlisted account (403
// hr_closed); the first such answer replaces everything with the closed notice.
// ════════════════════════════════════════════════════════════════════════

import { SUPABASE_CONFIG, createSupabaseClient } from '../net/supabase-bootstrap.js?v=0.1.0';
import { createAuth } from '../net/auth.js?v=0.1.0';
import { SESSION_CONFIG } from '../session/config.js?v=0.1.0';
import { createServerLink } from '../session/server.js?v=0.1.0';
import { AccountSession } from '../session/account-session.js?v=0.1.0';
import { FRAME_EVENT } from '../session/character-session.js?v=0.1.0';
import { renderAuthScreen, AUTH_BRAND } from './sign-in.js?v=0.1.0';
import { mountWorldPane } from './world-pane.js?v=0.1.0';
import { escapeHtml as esc } from '../utils/dom.js?v=0.1.0';

const DISCORD = 'https://discord.gg/eJrUSUJM3M';

/** A private broadcast topic on the shared client: (topic, onMessage, onStatus) => leave. */
function channelFor(client, auth) {
  return (topic, onMessage, onStatus) => {
    try { client.realtime.setAuth(auth.token()); } catch (e) { /* the join reports it */ }
    const ch = client.channel(topic, { config: { private: true } });
    ch.on('broadcast', { event: FRAME_EVENT }, (m) => onMessage(m && m.payload));
    ch.subscribe((status) => onStatus(status));
    return () => { client.removeChannel(ch); };
  };
}

function startApp(win) {
  const doc = win.document;
  const root = doc.getElementById('app');
  const HS = win.HearthriseStorage;
  const store = SESSION_CONFIG.authStore === 'tab' ? HS.session : HS;
  const client = createSupabaseClient(win.supabase, store, SESSION_CONFIG.authKey);
  const auth = createAuth({ client, device: HS, tab: HS.session, redirectTo: win.location.origin + win.location.pathname });
  let account = null;
  let pane = null;
  let shown = null;

  const recovering = /type=recovery/.test(win.location.hash);

  function clear() {
    if (pane) { pane.destroy(); pane = null; }
    root.innerHTML = '';
  }

  function showAuth(mode) {
    clear();
    root.className = 'app is-auth';
    const box = doc.createElement('main');
    box.className = 'auth';
    root.appendChild(box);
    renderAuthScreen(box, auth, mode, { signedIn: () => startAccount() });
  }

  function showClosed() {
    clear();
    root.className = 'app is-auth';
    root.innerHTML = '<main class="auth">' + AUTH_BRAND + '<div class="auth-card">'
      + '<h1 class="auth-title">Hearthrise is closed while we rebuild it.</h1>'
      + '<p class="auth-lead">Your account is not on the list for this test. Discord gets the date first.</p>'
      + '<p class="auth-links"><a class="auth-link" href="' + DISCORD + '" rel="noopener">Join the Discord</a>'
      + '<button type="button" class="auth-link" data-app="sign-out">Sign out</button></p></div></main>';
  }

  async function signOut() {
    shown = null;
    if (account) { const a = account; account = null; await a.signOut(); } else await auth.signOut();
    showAuth('sign-in');
  }

  async function startAccount() {
    if (!auth.userId()) { showAuth('sign-in'); return; }
    if (account) return;
    const server = createServerLink({ url: SUPABASE_CONFIG.url, anonKey: SUPABASE_CONFIG.anonKey, token: auth.token });
    account = new AccountSession({ auth, server, tab: HS.session, channel: channelFor(client, auth) });
    account.subscribe((why) => { if (why === 'closed-game') showClosed(); });
    await showCharacters();
  }

  async function showCharacters() {
    clear();
    root.className = 'app is-auth';
    root.innerHTML = '<main class="auth">' + AUTH_BRAND + '<div class="auth-card"><h1 class="auth-title">Your characters</h1>'
      + '<p class="auth-lead" role="status">Reading your characters…</p></div></main>';
    const a = account;
    const roster = await a.roster();
    if (a !== account || a.closedGame) return;
    const open = new Set(a.characters().map((c) => c.slot));
    const rows = roster.map((r) => '<li class="char-row"><span class="char-name">Character ' + (r.slot + 1) + '</span>'
      + (r.exists
        ? '<button type="button" class="auth-submit" data-app="play" data-slot="' + r.slot + '">' + (open.has(r.slot) ? 'Show' : 'Play') + '</button>'
        : '<button type="button" class="auth-submit" data-app="create" data-slot="' + r.slot + '">Create this character</button>')
      + '</li>').join('');
    root.querySelector('.auth-card').innerHTML = '<h1 class="auth-title">Your characters</h1>'
      + '<p class="auth-lead">Signed in as ' + esc(auth.email() || 'you') + '. Up to ' + SESSION_CONFIG.maxConcurrentCharacters + ' can play at once.</p>'
      + '<ul class="char-list">' + (rows || '<li class="char-row">The server did not answer. Reload to try again.</li>') + '</ul>'
      + '<p class="auth-message" role="status" aria-live="polite"></p>'
      + '<p class="auth-links"><button type="button" class="auth-link" data-app="sign-out">Sign out</button></p>';
  }

  async function play(slot) {
    const r = await account.open(slot);
    if (!r.ok) {
      const m = root.querySelector('.auth-message');
      if (m) m.textContent = r.reason === 'limit' ? 'Close a character first: ' + SESSION_CONFIG.maxConcurrentCharacters + ' are already playing.'
        : 'That character could not be loaded. Try again in a minute.';
      return;
    }
    shown = slot;
    await showGame();
  }

  async function showGame() {
    clear();
    root.className = 'app is-game';
    const strip = doc.createElement('nav');
    strip.className = 'char-strip';
    strip.setAttribute('aria-label', 'Characters');
    strip.innerHTML = account.characters().map((c) => '<button type="button" class="char-tab' + (c.slot === shown ? ' is-shown' : '') + '"'
      + ' data-app="show" data-slot="' + c.slot + '" aria-pressed="' + (c.slot === shown) + '">Character ' + (c.slot + 1) + '</button>').join('')
      + '<button type="button" class="char-tab" data-app="characters">Characters</button>'
      + '<button type="button" class="char-tab" data-app="sign-out">Sign out</button>';
    const main = doc.createElement('main');
    main.className = 'game';
    root.appendChild(strip);
    root.appendChild(main);
    const cs = account.character(shown);
    const acc = account;
    if (cs) pane = await mountWorldPane(main, cs, { screen: root, account: acc, peers: () => (acc ? acc.characters() : [cs]) });
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-app]');
    if (!t) return;
    const what = t.getAttribute('data-app');
    const slot = Number(t.getAttribute('data-slot'));
    if (what === 'sign-out') signOut();
    else if (what === 'characters') showCharacters();
    else if (what === 'play') play(slot);
    else if (what === 'show') { shown = slot; showGame(); }
    else if (what === 'create') {
      account.create(slot).then((r) => (r.ok ? play(slot) : showCharacters()));
    }
  });

  auth.onChange((ev) => {
    if (ev === 'recovery') showAuth('set-password');
    else if (ev === 'signed-out' && account) { account = null; showAuth('sign-in'); }
  });

  auth.refresh().then(() => {
    if (recovering) showAuth('set-password');
    else if (auth.userId()) startAccount();
    else showAuth('sign-in');
  });
  return { auth, account: () => account };
}

if (typeof window !== 'undefined' && window.document && window.document.getElementById('app')) startApp(window);
