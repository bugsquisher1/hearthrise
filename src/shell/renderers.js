// ════════════════════════════════════════════════════════════════════════
// src/shell/renderers.js — ONE RENDERER PER ROW, AND ONE ROW PER RENDERER.
//
// A window or a widget is a data row (src/data/shell-windows.js,
// src/data/hud-widgets.js) plus an entry here under the same id. A renderer
// takes the shell context ({wm, hud, glyphs, G, refresh}) and returns the body
// HTML. tests/shell-renderers.mjs fails the build on a row with no renderer or
// a renderer with no row, so a launcher can never open an empty window.
// ════════════════════════════════════════════════════════════════════════
import { renderLaunchers } from './launcher.js?v=0.1.0';
import { renderHudSettings } from './hud.js?v=0.1.0';
import { renderHuntTopbar } from './widgets/hunt-topbar.js?v=0.1.0';
import { renderPartyPanel } from './widgets/party-panel.js?v=0.1.0';
import { renderAnalyzer } from './widgets/analyzer.js?v=0.1.0';
import { renderActionBar } from './widgets/action-bar.js?v=0.1.0';
import { renderHuntSettings } from './windows/hunt-settings.js?v=0.1.0';
import { renderChat } from './windows/chat.js?v=0.1.0';
import { renderSettings } from './windows/settings.js?v=0.1.0';

/* A renderer with `.patch` is a component: built once, then patched in place (src/shell/shell.js). */
export const WINDOW_RENDERERS = Object.freeze({
  hud: renderHudSettings,
  'hunt-settings': renderHuntSettings,
  chat: renderChat,
  settings: renderSettings,
});

export const WIDGET_RENDERERS = Object.freeze({
  launchers: renderLaunchers,
  'hunt-topbar': renderHuntTopbar,
  party: renderPartyPanel,
  analyzer: renderAnalyzer,
  'action-bar': renderActionBar,
});
