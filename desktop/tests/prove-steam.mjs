#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// desktop/tests/prove-steam.mjs — STEAMWORKS IN THE SHELL, WITH VALVE'S PUBLIC TEST APP (480, SPACEWAR).
//
//   node tests/prove-steam.mjs                 Steamworks answers, or says exactly why it can't. The window stays hidden.
//   node tests/prove-steam.mjs --overlay       also: the window shown without focus, off every screen; is Steam's overlay DLL in this
//                                              process, and what does the window look like from outside (desktopCapturer sees the
//                                              presented frame, overlay included; capturePage sees only the page)
//   node tests/prove-steam.mjs --overlay --open  also asks the overlay to open its friends dialog. Off by default: with no overlay,
//                                              Steam may answer in its own window, on the real screen.
//
// Nothing shows on the real screen and no focus moves. No account name or Steam id is printed. No purchase, no partner account:
// 480 is free to everyone. Needs a Steam client already running and signed in.
// Exit 0 green, 1 red, 2 harness.
// mutant-anchors: none — a prototype's proof, not a repo guard
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHOTS, createReport, dropProfile, freshProfile, launch } from './_harness.mjs';

const r = createReport('prove-steam');
const wantOverlay = process.argv.includes('--overlay');
const wantOpen = process.argv.includes('--open');
const telemetry = (u) => /posthog\.com|sentry\.io/.test(u.host);
const profile = freshProfile('steam');
let a = null;

/** The window as the OS shows it: a presented frame, overlay included. */
async function fromOutside(name) {
  const b64 = await a.main(async ({ desktopCapturer }) => {
    const id = globalThis.__hrShell.win.getMediaSourceId();
    const list = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1280, height: 800 }, fetchWindowIcons: false });
    const s = list.find((x) => x.id === id) || list.find((x) => x.name === 'Hearthrise');
    return s ? s.thumbnail.toPNG().toString('base64') : null;
  });
  if (!b64) { r.note('from outside: no source for ' + name, ''); return null; }
  const file = join(SHOTS, name + '.png');
  writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

try {
  const env = { HR_STEAM_APPID: '480' };
  if (wantOverlay) { env.HR_DESKTOP_HIDDEN = '0'; env.HR_DESKTOP_PLACE = '-20000,-20000'; }
  a = await launch({ profile, block: telemetry, env });
  await a.page.waitForSelector('form[data-auth="sign-in"]', { timeout: 120000 });
  const s = await a.main(() => {
    const st = globalThis.__hrShell.steam;
    if (!st.running) return { running: false, why: st.why };
    const c = st.client;
    return {
      running: true, appId: c.utils.getAppId(), hasPlayerName: !!c.localplayer.getName(), hasSteamId: !!c.localplayer.getSteamId().steamId64,
      onDeck: c.utils.isSteamRunningOnSteamDeck(), serverTime: !!c.utils.getServerRealTime(), language: c.apps.currentGameLanguage(),
      subscribed: c.apps.isSubscribed(),
    };
  });
  r.note('Steamworks answered', s);
  r.step('Steamworks initialized with app 480', s.running === true, s.why || '');
  const seen = await a.page.evaluate(() => ({ running: window.hearthriseShell.steam.running, keys: Object.keys(window.hearthriseShell.steam).join() }));
  r.step('the page sees only "steam is running", never the handle', seen.running === s.running && seen.keys === 'running', seen);
  if (s.running && wantOverlay) {
    const sw = await a.main(({ app }) => ({ inProcessGpu: app.commandLine.hasSwitch('in-process-gpu'), noDirectComposition: app.commandLine.hasSwitch('disable-direct-composition'), canvas: app.getGPUFeatureStatus()['2d_canvas'] }));
    r.note('overlay switches', sw);
    const modules = () => a.main(() => process.report.getReport().sharedObjects.filter((x) => /gameoverlay|steam_api|steamclient/i.test(x)).map((x) => x.split(/[\\/]/).pop()));
    const pos = await a.main(() => { const w = globalThis.__hrShell.win; return { visible: w.isVisible(), focused: w.isFocused(), bounds: w.getBounds() }; });
    r.note('the window', pos);
    await a.page.waitForTimeout(2000);
    await fromOutside('steam-outside-02s');
    await a.page.waitForTimeout(6000);   // Valve: the overlay takes a few seconds to start and hook
    const mods = await modules();
    r.note('Steam modules in the app process', mods);
    r.step('Steam\'s overlay DLL is loaded in the process that presents frames', mods.some((m) => /gameoverlayrenderer/i.test(m)), mods);
    await fromOutside('steam-outside-08s');
    await a.shot('steam-page-08s');
    if (wantOpen) {
      await a.main(() => { globalThis.__hrShell.steam.client.overlay.activateDialog(0); });
      await a.page.waitForTimeout(4000);
      await fromOutside('steam-outside-open');
      await a.shot('steam-page-open');
      await a.main(() => { globalThis.__hrShell.steam.client.overlay.activateDialog(0); });
      await a.page.waitForTimeout(1500);
    }
  }
  r.step('no console errors', a.errors.length === 0, a.errors.slice(0, 5).join(' | ').slice(0, 400));
  await a.close();
  a = null;
} catch (e) {
  r.step('the walk finished', false, String(e && e.stack || e).slice(0, 800));
} finally {
  if (a) await a.close();
  dropProfile(profile);
}
process.exit(r.finish());
