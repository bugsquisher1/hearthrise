// ════════════════════════════════════════════════════════════════════════
// src/app/boot.js — THE CLIENT'S ENTRY (play.html).
//
//   boot → auth (src/net/auth.js over the one supabase-js client)
//        → AccountSession (src/session/account-session.js): one per login
//        → the characters screen: the account's slots, read from the server
//        → the game: the character strip (src/app/character-strip.js; up to the
//          server's concurrent limit, each its own CharacterSession), built
//          once, and the World pane with the shell over it for the VIEWED
//          character (src/app/world-pane.js); one alert centre for the account
//          (src/shell/alerts.js) watches every open character
//
// Which open character is shown is AccountSession.viewed, a view pointer; a
// switch remounts only the pane, and every other character keeps its record,
// channel and timers. A reload signs back in from the stored session and
// starts at the characters screen.
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
import { mountCharacterStrip } from './character-strip.js?v=0.1.0';
import { createAlertCenter } from '../shell/alerts.js?v=0.1.0';
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
  let alerts = null;
  let pane = null;
  let strip = null;
  let paneSeq = 0;
  let openAfter = null;

  const recovering = /type=recovery/.test(win.location.hash);

  function clear() {
    paneSeq++;
    if (pane) { pane.destroy(); pane = null; }
    if (strip) { strip.destroy(); strip = null; }
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
    if (alerts) { alerts.destroy(); alerts = null; }
    if (account) { const a = account; account = null; await a.signOut(); } else await auth.signOut();
    showAuth('sign-in');
  }

  async function startAccount() {
    if (!auth.userId()) { showAuth('sign-in'); return; }
    if (account) return;
    const server = createServerLink({ url: SUPABASE_CONFIG.url, anonKey: SUPABASE_CONFIG.anonKey, token: auth.token });
    account = new AccountSession({ auth, server, tab: HS.session, channel: channelFor(client, auth) });
    account.subscribe((why) => {
      if (why === 'closed-game') showClosed();
      else if (why === 'viewed' && strip) showPane();
    });
    alerts = createAlertCenter(account);
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
      + '<p class="auth-lead">Signed in as ' + esc(auth.email() || 'you') + '. ' + (a.limit() > 1 ? 'Up to ' + a.limit() + ' can play at once.' : 'One can play at a time.') + '</p>'
      + '<ul class="char-list">' + (rows || '<li class="char-row">The server did not answer. Reload to try again.</li>') + '</ul>'
      + '<p class="auth-message" role="status" aria-live="polite"></p>'
      + '<p class="auth-links"><button type="button" class="auth-link" data-app="sign-out">Sign out</button></p>';
  }

  async function play(slot) {
    const r = await account.open(slot);
    if (!r.ok) {
      const m = root.querySelector('.auth-message');
      if (m) m.textContent = r.reason === 'limit' ? 'Close a character first: ' + (r.limit > 1 ? r.limit + ' are' : 'one is') + ' already playing.'
        : 'That character could not be loaded. Try again in a minute.';
      return;
    }
    account.view(slot);
    await showGame();
  }

  /* The game screen: the strip once, then the viewed character's pane. */
  async function showGame() {
    if (!strip) {
      clear();
      root.className = 'app is-game';
      const nav = doc.createElement('nav');
      const main = doc.createElement('main');
      main.className = 'game';
      root.appendChild(nav);
      root.appendChild(main);
      strip = mountCharacterStrip(nav, { account, alerts, glyphs: () => win.HR_GLYPHS || {} });
    }
    await showPane();
  }

  /* Only the pane is remounted on a switch; a later switch supersedes one still mounting. */
  async function showPane() {
    const main = root.querySelector('main.game');
    const acc = account;
    const cs = acc && acc.character(acc.viewed);
    const want = openAfter;
    openAfter = null;
    if (!main || !cs) return;
    if (pane && pane.slot === cs.slot) { if (want) pane.shell.open(want); return; }
    const seq = ++paneSeq;
    if (pane) { pane.destroy(); pane = null; }
    const p = await mountWorldPane(main, cs, { screen: root, account: acc, alerts, goTo,
      peers: () => (acc ? acc.characters() : [cs]) });
    if (seq !== paneSeq) { p.destroy(); return; }
    pane = Object.assign(p, { slot: cs.slot });
    if (strip) strip.patch();
    if (want) pane.shell.open(want);
  }

  /** Show another open character, and open one of its windows there (an alert's next action). */
  function goTo(slot, winId) {
    if (!account) return;
    openAfter = winId || null;
    if (account.viewed === slot) { showPane(); return; }
    account.view(slot);
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-app]');
    if (!t) return;
    const what = t.getAttribute('data-app');
    const slot = Number(t.getAttribute('data-slot'));
    if (what === 'sign-out') signOut();
    else if (what === 'characters') showCharacters();
    else if (what === 'play') play(slot);
    else if (what === 'show') goTo(slot, null);
    else if (what === 'all') { if (pane) pane.shell.toggle('characters'); }
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
