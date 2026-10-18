// ════════════════════════════════════════════════════════════════════════
// src/shell/renderers.js — ONE RENDERER PER ROW, AND ONE ROW PER RENDERER.
//
// A window or a widget is a data row (src/data/shell-windows.js,
// src/data/hud-widgets.js) plus an entry here under the same id. A renderer
// takes the shell context ({wm, hud, glyphs, G, refresh}) and returns the body
// HTML. tests/shell-renderers.mjs fails the build on a row with no renderer or
// a renderer with no row, so a launcher can never open an empty window.
// ════════════════════════════════════════════════════════════════════════
import { renderLaunchers } from './launcher.js?v=0.2.0';
import { renderHudSettings } from './hud.js?v=0.2.0';
import { renderHuntTopbar } from './widgets/hunt-topbar.js?v=0.2.0';
import { renderPartyPanel } from './widgets/party-panel.js?v=0.2.0';
import { renderAnalyzer } from './widgets/analyzer.js?v=0.2.0';
import { renderActionBar } from './widgets/action-bar.js?v=0.2.0';
import { renderHuntSettings } from './windows/hunt-settings.js?v=0.2.0';
import { renderChat } from './windows/chat.js?v=0.2.0';
import { renderSettings } from './windows/settings.js?v=0.2.0';
import { renderInventory } from './windows/inventory/index.js?v=0.2.0';
import { renderCombatSkills, renderTradeSkills } from './windows/skills.js?v=0.2.0';
import { renderHunts } from './windows/hunts.js?v=0.2.0';
import { renderStorage } from './windows/storage.js?v=0.2.0';
import { renderShop } from './windows/shop.js?v=0.2.0';
import { renderServices } from './windows/services.js?v=0.2.0';
import { renderHuntPrep } from './windows/hunt-prep.js?v=0.2.0';
import { renderParty } from './windows/party.js?v=0.2.0';
import { renderCharacters } from './windows/characters.js?v=0.2.0';
import { renderAlerts } from './widgets/alerts.js?v=0.2.0';

/* A renderer with `.patch` is a component: built once, then patched in place (src/shell/shell.js). */
export const WINDOW_RENDERERS = Object.freeze({
  hunts: renderHunts,
  inventory: renderInventory,
  'skills-combat': renderCombatSkills,
  'skills-trade': renderTradeSkills,
  storage: renderStorage,
  shop: renderShop,
  services: renderServices,
  'hunt-prep': renderHuntPrep,
  'hunt-party': renderParty,
  characters: renderCharacters,
  hud: renderHudSettings,
  'hunt-settings': renderHuntSettings,
  chat: renderChat,
  settings: renderSettings,
});

export const WIDGET_RENDERERS = Object.freeze({
  launchers: renderLaunchers,
  alerts: renderAlerts,
  'hunt-topbar': renderHuntTopbar,
  party: renderPartyPanel,
  analyzer: renderAnalyzer,
  'action-bar': renderActionBar,
});
