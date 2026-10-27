// ════════════════════════════════════════════════════════════════════════
// src/app/boot.js — THE CLIENT'S ENTRY (play.html).
//
//   boot → auth (src/net/auth.js over the one supabase-js client)
//        → AccountSession (src/session/account-session.js): one per login
//        → the characters screen: the account's slots, read from the server
//          and, under them, the next hero slot for sale at the server's price, paid
//          from the account's gold (src/app/slot-offer.js; ONE intent, re-read on its answer)
//        → an empty (or unnamed) slot opens the creation step (src/app/hero-create.js):
//          name + four colours, ONE intent; the hero enters town on the server's yes
//        → the game: the character strip (src/app/character-strip.js; up to the
//          server's concurrent limit, each its own CharacterSession), built
//          once, and the World pane with the shell over it for the VIEWED
//          character (src/app/world-pane.js); one alert centre for the account
//          (src/shell/alerts.js) watches every open character
//
// Which open character is shown is AccountSession.viewed, a view pointer; a
// switch remounts only the pane; the shown character streams live and the others play on the server (a plain
// read a minute, CharacterSession.setViewed). A reload signs back in from the stored session and
// starts at the characters screen.
//
// THE CLOSED GAME: the server refuses a non-allowlisted account (403
// hr_closed); the first such answer replaces everything with the closed notice.
//
// A NEW RELEASE (src/app/new-version.js): every screen, signed in or not, asks
// which build the site serves; a different one raises one reload banner. An
// answer that looks like a stale client's asks at once.
//
// A DEAD SESSION (a refresh the server refuses, or a sign-out in another tab)
// closes every character and lands on sign-in with one plain line; nothing is
// retried in the background.
// ════════════════════════════════════════════════════════════════════════

import { SUPABASE_CONFIG, createSupabaseClient } from '../net/supabase-bootstrap.js?v=0.2.55';
import { createAuth, AUTH_COPY } from '../net/auth.js?v=0.2.55';
import { SESSION_CONFIG } from '../session/config.js?v=0.2.55';
import { createServerLink } from '../session/server.js?v=0.2.55';
import { AccountSession } from '../session/account-session.js?v=0.2.55';
import { FRAME_EVENT } from '../session/character-session.js?v=0.2.55';
import { renderAuthScreen, AUTH_BRAND } from './sign-in.js?v=0.2.55';
import { mountWorldPane } from './world-pane.js?v=0.2.55';
import { mountCharacterStrip, stripTargetOf } from './character-strip.js?v=0.2.55';
import { renderHeroCreate } from './hero-create.js?v=0.2.55';
import { slotOfferHtml, slotRefusalText } from './slot-offer.js?v=0.2.55';
import { createAlertCenter } from '../shell/alerts.js?v=0.2.55';
import { createSocialRealtime } from '../social/realtime.js?v=0.2.55';
import { SocialSession } from '../social/social-session.js?v=0.2.55';
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.55';
import { startObservability, track } from '../net/observability.js?v=0.2.55';
import { startDiagnostics } from '../net/diagnostics.js?v=0.2.55';
import { mountPressAck } from '../shell/press-ack.js?v=0.2.55';
import { liveOverlayWanted, mountLiveOverlay } from './live-overlay.js?v=0.2.55';
import { mountNewVersion } from './new-version.js?v=0.2.55';
import { pointerCardOf } from '../session/tutorial-sections.js?v=0.2.55';
import { coachFactsOf } from '../shell/launcher.js?v=0.2.55';

const DISCORD = 'https://discord.gg/eJrUSUJM3M';

/** A private broadcast topic on the shared client: (topic, onMessage, onStatus) => leave. */
function channelFor(client, auth) {
  return (topic, onMessage, onStatus) => {
    try { client.realtime.setAuth(auth.token()); } catch (e) { /* the join reports it */ }
    const ch = client.channel(topic, { config: { private: true } });
    ch.on('broadcast', { event: FRAME_EVENT }, (m) => onMessage(m && m.payload));
    /* Left once; a status after the leave (removeChannel's own CLOSED) is not reported back. */
    let left = false;
    ch.subscribe((status) => { if (!left) onStatus(status); });
    return () => { if (left) return; left = true; client.removeChannel(ch); };
  };
}

function startApp(win) {
  /* What this load saw go wrong (src/net/diagnostics.js), on every host: a player's report attaches it.
     First, so its console copy sits under Sentry's. Then errors and replays (src/net/observability.js):
     telemetry only, nothing sent off hearthrise.net. */
  startDiagnostics(win);
  const obs = startObservability(win);
  const doc = win.document;
  const root = doc.getElementById('app');
  const fresh = mountNewVersion(win);
  const HS = win.HearthriseStorage;
  const store = SESSION_CONFIG.authStore === 'tab' ? HS.session : HS;
  const client = createSupabaseClient(win.supabase, store, SESSION_CONFIG.authKey);
  const auth = createAuth({ client, device: HS, tab: HS.session, redirectTo: win.location.origin + win.location.pathname, doc });
  let account = null;
  let alerts = null;
  let watchers = [];   // the account's page-level watchers: the press acknowledgement, ?debug=live
  let pane = null;
  let strip = null;
  let paneSeq = 0;
  let openAfter = null;
  let creating = null;
  let rosterSlots = [];   // the account's existing characters, as the roster last read them
  let roster = [];        // the roster rows the characters screen shows (the server's, as last read)
  let slotBuying = false; // a hero-slot purchase is in flight: the button stays off until the answer

  const recovering = /type=recovery/.test(win.location.hash);

  function clear() {
    paneSeq++;
    if (creating) { creating.destroy(); creating = null; }
    if (pane) { pane.destroy(); pane = null; }
    if (strip) { strip.destroy(); strip = null; }
    root.innerHTML = '';
  }

  function showAuth(mode) {
    clear();
    obs.screen('auth');
    root.className = 'app is-auth';
    const box = doc.createElement('main');
    box.className = 'auth';
    root.appendChild(box);
    renderAuthScreen(box, auth, mode, { signedIn: () => startAccount() });
  }

  function showClosed() {
    clear();
    obs.screen('closed');
    root.className = 'app is-auth';
    root.innerHTML = '<main class="auth">' + AUTH_BRAND + '<div class="auth-card">'
      + '<h1 class="auth-title">Playtest</h1>'
      + '<p class="auth-lead">Hearthrise is a new game in development. Follow Discord for the first playtest.</p>'
      + '<p class="auth-lead">Your account is not on the list for this test. Discord gets the date first.</p>'
      + '<p class="auth-links"><a class="auth-link" href="' + DISCORD + '" rel="noopener">Join the Discord</a>'
      + '<button type="button" class="auth-link" data-app="sign-out">Sign out</button></p></div></main>';
  }

  /* The session ended under the game: close everything, then say so on the sign-in screen. */
  async function sessionEnded() {
    if (!account) return;
    endWatchers();
    if (alerts) { alerts.destroy(); alerts = null; }
    const a = account;
    account = null;
    obs.forget();
    await a.signOut();
    showAuth('sign-in');
    const m = root.querySelector('.auth-message');
    if (m) m.textContent = AUTH_COPY.signedOut;
  }

  function endWatchers() { for (const w of watchers) w.destroy(); watchers = []; }

  async function signOut() {
    endWatchers();
    if (alerts) { alerts.destroy(); alerts = null; }
    if (account) { const a = account; account = null; await a.signOut(); } else await auth.signOut();
    obs.forget();
    showAuth('sign-in');
  }

  async function startAccount() {
    if (!auth.userId()) { showAuth('sign-in'); return; }
    if (account) return;
    obs.identify(auth.userId());
    const server = createServerLink({ url: SUPABASE_CONFIG.url, anonKey: SUPABASE_CONFIG.anonKey, token: auth.freshToken, renew: auth.renewToken,
      stale: () => fresh.check(true) });
    account = new AccountSession({ auth, server, tab: HS.session, channel: channelFor(client, auth),
      social: (acc) => new SocialSession({ account: acc, realtime: createSocialRealtime(client, auth.token) }) });
    account.subscribe((why) => {
      if (why === 'closed-game') showClosed();
      else if (why === 'viewed' && strip) showPane();
    });
    alerts = createAlertCenter(account);
    /* Every press answers at once (src/shell/press-ack.js); ?debug=live adds the corner (live-overlay.js). */
    watchers = [mountPressAck(doc, account.intents)];
    if (liveOverlayWanted(win.location.search)) watchers.push(mountLiveOverlay(win, account));
    account.social.chat.followAlerts(alerts);   // the alerts are also the chat's System lines
    await showCharacters();
  }

  async function showCharacters(note) {
    clear();
    obs.screen('characters');
    root.className = 'app is-auth';
    root.innerHTML = '<main class="auth">' + AUTH_BRAND + '<div class="auth-card"><h1 class="auth-title">Your characters</h1>'
      + '<p class="auth-lead" role="status">Reading your characters…</p></div></main>';
    const a = account;
    const read = await a.roster();
    if (a !== account || a.closedGame) return;
    roster = read;
    rosterSlots = roster.filter((r) => r.exists).map((r) => r.slot);
    const open = new Set(a.characters().map((c) => c.slot));
    /* Each owned slot: its hero by name and Level (the server's), or an empty slot to create in; the whole
       row is the press. Every account owns two (Tyler 10-17); the next one for sale is offered under the list. */
    const rows = roster.map((r) => '<li class="char-row' + (r.exists ? '' : ' is-empty') + '">'
      + '<button type="button" class="char-pick" ' + (r.exists ? 'data-app="play"' : 'data-app="create"') + ' data-slot="' + r.slot + '">'
      + '<span class="char-name"><b>' + (r.exists ? esc(r.name || 'Unnamed hero') : r.unnamed ? 'Unnamed hero' : 'Empty slot') + '</b>'
      + (r.exists && r.level ? ' <small class="char-level">Level ' + r.level + '</small>' : '') + '</span> '
      + '<span class="char-go">' + (r.exists ? (open.has(r.slot) ? 'Show' : 'Play') : r.unnamed ? 'Name hero' : 'Create hero') + '</span>'
      + '</button></li>').join('');
    /* the server's play-at-once limit, never a client fallback (board 2026-10-25 #8: an empty account read "One can play
       at a time." because the server had not said yet); unsaid, nothing is said */
    const lim = a.statedLimit();
    const playLine = lim === null ? '' : lim > 1 ? 'Up to ' + Math.min(lim, a.limit()) + ' can play at once.' : 'One can play at a time.';
    root.querySelector('.auth-card').innerHTML = '<h1 class="auth-title">Your characters</h1>'
      + '<p class="auth-lead">Signed in as ' + esc(auth.email() || 'you') + '. ' + playLine + '</p>'
      + '<ul class="char-list">' + (rows || '<li class="char-row">The server did not answer. Reload to try again.</li>') + '</ul>'
      + '<div class="slot-offer-mount">' + slotOfferHtml(a.slotOffer, roster, { pending: slotBuying }) + '</div>'
      + '<p class="auth-message' + (note ? ' is-good' : '') + '" role="status" aria-live="polite">' + esc(note || '') + '</p>'
      + '<p class="auth-links"><button type="button" class="auth-link" data-app="sign-out">Sign out</button></p>';
    ringCharacters(a, root.querySelector('.auth-card'));
  }

  /* THE COACH ON THE CHARACTERS SCREEN (board 2026-10-25 D4 "More than one hero"): the game's shell is gone here, so the
     screen rings the step the viewed hero's card names on it (its hooks: Create hero in the empty slot), the deepest
     one on screen, from the same facts the shell reads (src/shell/launcher.js coachFactsOf). Display only. */
  function ringCharacters(a, card) {
    const cs = a.character(a.viewed);
    const c = cs ? pointerCardOf(cs, coachFactsOf(cs, a)) : null;
    const el = c && c.hooks ? c.hooks.slice().reverse().map((q) => card.querySelector(q)).find(Boolean) : null;
    if (el) el.setAttribute('data-coach-ring', '');
  }

  /* The offer block alone, redrawn while a purchase is in flight. */
  function drawSlotOffer() {
    const m = root.querySelector('.slot-offer-mount');
    if (m && account) m.innerHTML = slotOfferHtml(account.slotOffer, roster, { pending: slotBuying });
  }

  /* ONE purchase from the account's gold (`actor`: the hero the journal names): the button is off until the
     server answers; a yes re-reads the roster from the server. */
  async function buySlot(slotId, actor) {
    if (slotBuying || !account || !Number.isInteger(slotId) || !Number.isInteger(actor)) return;
    const a = account;
    slotBuying = true;
    drawSlotOffer();
    const r = await a.buySlot(slotId, actor);
    slotBuying = false;
    if (a !== account || a.closedGame) return;
    if (r.ok) { track('hero_slot_bought'); await showCharacters('Hero slot bought. Create your new hero in it.'); return; }
    drawSlotOffer();
    const m = root.querySelector('.auth-message');
    if (m) { m.classList.remove('is-good'); m.textContent = slotRefusalText(r); }
  }

  /* The creation step over the characters card: the hero enters town only on the server's yes. */
  function showCreate(slot) {
    clear();
    root.className = 'app is-auth';
    root.innerHTML = '<main class="auth">' + AUTH_BRAND + '<div class="auth-card is-create"></div></main>';
    const tokens = win.getComputedStyle(doc.documentElement);
    creating = renderHeroCreate(root.querySelector('.auth-card'), {
      slot,
      colorOf: (t) => tokens.getPropertyValue('--' + t),
      create: (name, colors) => account.create(slot, name, colors),
      done: () => { track('character_created'); play(slot); },
      back: () => showCharacters(),
    });
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
    /* the account's other characters play too (in town for everyone), unviewed */
    if (account) await account.openOthers(rosterSlots);
  }

  /* The game screen: the strip once, then the viewed character's pane. */
  async function showGame() {
    if (!strip) {
      clear();
      obs.screen('game');
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
    /* The strip's tabs open the viewed shell's one player menu (Invite to party / Leave party for own characters). */
    const nav = root.querySelector('nav.char-strip');
    if (nav && p.shell && p.shell.menu) p.shell.menu.attach(nav, stripTargetOf);
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
    else if (what === 'create') showCreate(slot);
    else if (what === 'buy-slot') buySlot(Number(t.getAttribute('data-slot-id')), Number(t.getAttribute('data-pay')));
  });

  auth.onChange((ev) => {
    if (ev === 'recovery') showAuth('set-password');
    else if (ev === 'signed-out' || ev === 'expired') sessionEnded();
  });

  auth.refresh().then(() => {
    if (recovering) showAuth('set-password');
    else if (auth.userId()) startAccount();
    else showAuth('sign-in');
  });
  return { auth, account: () => account };
}

if (typeof window !== 'undefined' && window.document && window.document.getElementById('app')) startApp(window);
