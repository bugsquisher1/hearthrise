'use strict';
// ════════════════════════════════════════════════════════════════════════
// desktop/src/steam.cjs — STEAMWORKS, IF THERE IS A STEAM.
//
// Asked for by an app id. Today that is only HR_STEAM_APPID=480 (Valve's public test app, Spacewar): Hearthrise has no
// app id of its own in this repo yet, and with none this file loads nothing. The game itself plays with or without it,
// and no game rule ever reads anything here (CLAUDE.md §1).
//
// MUST RUN BEFORE app.whenReady(). Valve: SteamAPI_Init has to come before the D3D device exists, or the overlay can't
// hook it. Electron's GPU lives in its own process, where Steam's hook does not reach, so electronEnableSteamOverlay moves
// it into this one (--in-process-gpu), turns off direct composition, and repaints every frame (the overlay draws only when
// the game presents; Valve says so in its overlay doc).
// ════════════════════════════════════════════════════════════════════════

function openSteam(appId) {
  if (!appId) return { running: false, why: 'no app id', client: null, appId: 0 };
  let steamworks;
  try { steamworks = require('steamworks.js'); } catch (e) { return { running: false, why: 'binding failed to load: ' + e.message, client: null, appId }; }
  try { steamworks.electronEnableSteamOverlay(); } catch (e) { return { running: false, why: 'overlay switches: ' + e.message, client: null, appId }; }
  try {
    const client = steamworks.init(appId);
    return { running: true, why: '', client, appId, callbacks: steamworks.SteamCallback };
  } catch (e) {
    return { running: false, why: String(e && e.message || e), client: null, appId };
  }
}

module.exports = { openSteam };
