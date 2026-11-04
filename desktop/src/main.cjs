'use strict';
// ════════════════════════════════════════════════════════════════════════
// desktop/src/main.cjs — THE STEAM SHELL: ONE WINDOW THAT PLAYS THE REAL GAME.
//
// A PROTOTYPE; nothing here ships to players yet. The report is on docs/planning/PRIORITY_BOARD.md (2026-11-04).
// The window loads https://hearthrise.net/play.html, the page every player gets, so the client can never be older than
// the server it talks to (CLAUDE.md §1). What the app itself carries is this file, the page's one narrow door (preload.cjs),
// the Steam binding and a "can't reach the server" page. The game's code does not know this exists.
//
// THE LOCKS. The page is remote, so it is treated as untrusted: sandboxed, context isolated, no Node, no webviews, no new
// windows, no permissions but fullscreen and copy. A press that leaves the game opens in the player's own browser.
//
// ENVIRONMENT, for the proofs in desktop/tests/ only. A release build honours only HR_DESKTOP_URL's loopback case
// (policy.cjs); the others just hide the window, move its data folder, or run the two experiments below.
//   HR_DESKTOP_URL=http://127.0.0.1:PORT/play.html    play a local world (tools/qa/local-world.mjs) instead of the site
//   HR_DESKTOP_HIDDEN=1                               never show the window, never take focus (Tyler's PC may be in use)
//   HR_DESKTOP_USER_DATA=DIR                          a throwaway profile
//   HR_DESKTOP_PLACE=x,y                              show without activating, at a spot off every screen (the overlay proof)
//   HR_STEAM_APPID=480                                ask Steamworks for Valve's public test app
//   HR_DESKTOP_BUNDLE=DIR                             EXPERIMENT: answer the game's origin from a built folder (tools/build-site.mjs)
//   HR_DESKTOP_NO_INTEGER=1                           EXPERIMENT: leave the page at the display's fractional scale
// ════════════════════════════════════════════════════════════════════════
const { app, BrowserWindow, Menu, ipcMain, net, screen, session, shell } = require('electron');
const { join, normalize } = require('node:path');
const { pathToFileURL } = require('node:url');
const { readFileSync, writeFileSync } = require('node:fs');
const { gameUrlOf, decideNavigation, tokenLinkFrom, integerScaleFor } = require('./policy.cjs');
const { openSteam } = require('./steam.cjs');

const env = process.env;
const SHELL_VERSION = require('../package.json').version;
const HIDDEN = env.HR_DESKTOP_HIDDEN === '1';
const PLACE = /^-?\d+,-?\d+$/.test(env.HR_DESKTOP_PLACE || '') ? env.HR_DESKTOP_PLACE.split(',').map(Number) : null;
const GAME_URL = gameUrlOf(env);
const OFFLINE_FILE = join(__dirname, 'offline.html');
const OFFLINE_URL = pathToFileURL(OFFLINE_FILE).href;
const RETRY_MS = 5000;
/* --bg-0 in src/styles/tokens.css (charcoal), so the first paint is the game's own colour and never a white flash. */
const WINDOW_BG = '#0a0b0e';

if (env.HR_DESKTOP_USER_DATA) app.setPath('userData', env.HR_DESKTOP_USER_DATA);
/* Before app.whenReady: see steam.cjs. */
const steam = openSteam(Number(env.HR_STEAM_APPID) || 0);

let win = null;
let retryTimer = null;
let integerZoom = 1;

/* ── ONE COPY OF THE APP ──────────────────────────────────────────────── */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (!HIDDEN && !PLACE) { if (win.isMinimized()) win.restore(); win.focus(); }
    const hash = tokenLinkFrom(argv);
    if (hash) loadGame(hash);
  });
  app.whenReady().then(start);
}

/* ── THE WINDOW ───────────────────────────────────────────────────────── */
const statePath = () => join(app.getPath('userData'), 'window-state.json');
function savedState() {
  try {
    const s = JSON.parse(readFileSync(statePath(), 'utf8'));
    return s && Number.isFinite(s.width) && Number.isFinite(s.height) ? s : null;
  } catch (e) { return null; }
}
function saveState() {
  if (!win || win.isDestroyed()) return;
  try { writeFileSync(statePath(), JSON.stringify({ ...win.getNormalBounds(), fullscreen: win.isFullScreen() })); } catch (e) { /* the next launch starts at the default size */ }
}
function firstBounds() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  /* A Steam Deck's screen: the whole of it, always. */
  if (area.width <= 1280 && area.height <= 800) return { width: area.width, height: area.height, fullscreen: true };
  return { width: Math.min(1440, area.width), height: Math.min(900, area.height), fullscreen: false };
}

function createWindow() {
  const s = savedState() || firstBounds();
  win = new BrowserWindow({
    width: s.width, height: s.height, x: PLACE ? PLACE[0] : s.x, y: PLACE ? PLACE[1] : s.y,
    minWidth: 1024, minHeight: 640,
    fullscreen: !!s.fullscreen && !HIDDEN && !PLACE,
    show: false,
    useContentSize: !savedState(),
    title: 'Hearthrise',
    backgroundColor: WINDOW_BG,
    skipTaskbar: HIDDEN || !!PLACE,
    focusable: !(HIDDEN || PLACE),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
      /* A hidden proof must keep running; a player's minimized game should not spin the fans. */
      backgroundThrottling: !(HIDDEN || PLACE),
      devTools: !app.isPackaged,
      additionalArguments: ['--hr-shell-version=' + SHELL_VERSION, '--hr-steam=' + (steam.running ? '1' : '0')],
    },
  });
  const wc = win.webContents;

  wc.setWindowOpenHandler(({ url }) => { sendOut(url); return { action: 'deny' }; });
  const guard = (e, url) => {
    if (decideNavigation(url, GAME_URL, OFFLINE_URL) === 'stay') return;
    e.preventDefault();
    sendOut(url);
  };
  wc.on('will-navigate', guard);
  wc.on('will-redirect', guard);
  wc.on('will-attach-webview', (e) => e.preventDefault());

  /* The page can't be reached, or the host answered with a failure: the one page we carry, and keep trying. */
  wc.on('did-fail-load', (_e, code, _desc, url, isMain) => { if (isMain && code !== -3 && url !== OFFLINE_URL) showOffline(); });
  wc.on('did-navigate', (_e, url, status) => { if (status >= 500 && url !== OFFLINE_URL) showOffline(); });

  /* Whole-number scale on every display the window meets. */
  const applyZoom = () => {
    if (env.HR_DESKTOP_NO_INTEGER === '1' || !win || win.isDestroyed()) return;
    integerZoom = integerScaleFor(screen.getDisplayMatching(win.getBounds())).zoom;
    wc.setZoomFactor(integerZoom);
  };
  wc.on('dom-ready', applyZoom);
  win.on('moved', applyZoom);
  screen.on('display-metrics-changed', applyZoom);
  wc.setVisualZoomLevelLimits(1, 1).catch(() => {});

  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    if (input.key === 'F12' && !app.isPackaged) { e.preventDefault(); wc.toggleDevTools(); }
  });

  win.once('ready-to-show', () => { if (PLACE) win.showInactive(); else if (!HIDDEN) win.show(); });
  win.on('close', saveState);
  win.on('closed', () => { win = null; if (retryTimer) clearInterval(retryTimer); });
}

/* A link out goes to the player's own browser, and only an https or mailto one. */
function sendOut(url) {
  if (decideNavigation(url, GAME_URL, OFFLINE_URL) === 'browser') shell.openExternal(url).catch(() => {});
}

function loadGame(hash) {
  if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
  /* A link's fragment alone would be a same-page move, and supabase-js reads the fragment only when a page starts. */
  win.loadURL(hash ? GAME_URL + (GAME_URL.includes('?') ? '&' : '?') + 'link=1' + hash : GAME_URL).catch(() => {});
}

function showOffline() {
  win.loadFile(OFFLINE_FILE).catch(() => {});
  if (retryTimer) return;
  retryTimer = setInterval(async () => {
    try {
      const r = await net.fetch(new URL(GAME_URL).origin + '/play.html', { method: 'HEAD', cache: 'no-store' });
      if (r.ok && win) loadGame();
    } catch (e) { /* still down */ }
  }, RETRY_MS);
}

/* EXPERIMENT (option B on the board): the game's own origin answered from a built folder, so the server and the auth
   redirect see the same origin as the site. Everything else goes out as usual. */
function serveBundle(dir) {
  const host = new URL(GAME_URL).host;
  const root = normalize(dir);
  session.defaultSession.protocol.handle('https', async (req) => {
    const u = new URL(req.url);
    if (u.host !== host) return net.fetch(req, { bypassCustomProtocolHandlers: true });
    const file = normalize(join(root, decodeURIComponent(u.pathname)));
    if (!file.startsWith(root)) return new Response('', { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
}

function start() {
  Menu.setApplicationMenu(null);
  app.userAgentFallback = app.userAgentFallback.replace(/ ?(Electron|hearthrise-desktop)\/\S+/g, '') + ' HearthriseDesktop/' + SHELL_VERSION;
  session.defaultSession.setPermissionRequestHandler((_wc, perm, answer) => answer(perm === 'fullscreen' || perm === 'clipboard-sanitized-write'));
  /* Chromium writes localStorage a few seconds late; a crash or Steam's Stop does not wait, and the session lives there. Measured: killed
     1.5 s after a token refresh the OLD refresh token was on disk, and the server has already retired it, so that player is signed out at
     the next refresh. So the moment an auth answer arrives (supabase-js stores it right after), the store is written out. */
  session.defaultSession.webRequest.onCompleted({ urls: ['*://*/auth/v1/token*', '*://*/auth/v1/verify*', '*://*/auth/v1/user*'] }, () => {
    for (const ms of [300, 1000]) setTimeout(() => session.defaultSession.flushStorageData(), ms);
  });
  ipcMain.on('hr-shell:retry', (e) => { if (e.senderFrame && e.senderFrame.url === OFFLINE_URL && win) loadGame(); });
  if (env.HR_DESKTOP_BUNDLE) serveBundle(env.HR_DESKTOP_BUNDLE);
  createWindow();
  /* The proofs reach in through this; it holds nothing a page can touch. */
  globalThis.__hrShell = { steam, win, GAME_URL, zoom: () => integerZoom, showOffline, loadGame };
  loadGame();
}

app.on('before-quit', () => { try { session.defaultSession.flushStorageData(); } catch (e) { /* quitting anyway */ } });
app.on('window-all-closed', () => app.quit());
