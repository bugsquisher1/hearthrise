'use strict';
// ════════════════════════════════════════════════════════════════════════
// desktop/src/preload.cjs — ALL THE PAGE EVER SEES OF THE SHELL.
//
// Sandboxed and context-isolated: the page is a remote site, so it gets plain facts and one button, never Node, never a
// file, never Steam's handle. Today the game reads none of it. A game feature that wants a newer shell must check for it
// here and do without: the page updates in seconds, the shell only through Steam.
// ════════════════════════════════════════════════════════════════════════
const { contextBridge, ipcRenderer } = require('electron');

const arg = (name) => { const p = '--hr-' + name + '='; const a = process.argv.find((v) => v.startsWith(p)); return a ? a.slice(p.length) : ''; };

contextBridge.exposeInMainWorld('hearthriseShell', Object.freeze({
  kind: 'desktop',
  version: arg('shell-version'),
  steam: Object.freeze({ running: arg('steam') === '1' }),
  retry: () => ipcRenderer.send('hr-shell:retry'),
}));
