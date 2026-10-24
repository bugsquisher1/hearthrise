// ════════════════════════════════════════════════════════════════════════
// src/shell/renderers.js — ONE RENDERER PER ROW, AND ONE ROW PER RENDERER.
//
// A window or a widget is a data row (src/data/shell-windows.js,
// src/data/hud-widgets.js) plus an entry here under the same id. A renderer
// takes the shell context ({wm, hud, glyphs, G, refresh}) and returns the body
// HTML. tests/shell-renderers.mjs fails the build on a row with no renderer or
// a renderer with no row, so a launcher can never open an empty window.
// ════════════════════════════════════════════════════════════════════════
import { renderLaunchers } from './launcher.js?v=0.2.45';
import { renderHudSettings } from './hud.js?v=0.2.45';
import { renderHuntTopbar } from './widgets/hunt-topbar.js?v=0.2.45';
import { renderPartyPanel } from './widgets/party-panel.js?v=0.2.45';
import { renderAnalyzer } from './widgets/analyzer.js?v=0.2.45';
import { renderActionBar } from './widgets/action-bar.js?v=0.2.45';
import { renderConfigureAction } from './windows/configure-action.js?v=0.2.45';
import { renderChat } from './windows/chat.js?v=0.2.45';
import { renderFriends } from './windows/friends.js?v=0.2.45';
import { renderInspect } from './windows/inspect.js?v=0.2.45';
import { renderSettings } from './windows/settings.js?v=0.2.45';
import { renderInventory } from './windows/inventory/index.js?v=0.2.45';
import { renderWork } from './windows/work.js?v=0.2.45';
import { renderCharacter } from './windows/character/index.js?v=0.2.45';
import { renderHunts } from './windows/hunts.js?v=0.2.45';
import { renderStorage } from './windows/storage.js?v=0.2.45';
import { renderShop } from './windows/shop.js?v=0.2.45';
import { renderServices } from './windows/services.js?v=0.2.45';
import { renderHuntPrep } from './windows/hunt-prep.js?v=0.2.45';
import { renderParty } from './windows/party.js?v=0.2.45';
import { renderCharacters } from './windows/characters.js?v=0.2.45';
import { renderAlerts } from './widgets/alerts.js?v=0.2.45';
import { renderHuntSummary } from './windows/hunt-summary.js?v=0.2.45';
import { renderReport } from './windows/report.js?v=0.2.45';
import { renderDeath } from './windows/death.js?v=0.2.45';
import { renderOnline } from './widgets/online.js?v=0.2.45';
import { renderHouse } from './windows/house.js?v=0.2.45';
import { renderFarm } from './windows/farm.js?v=0.2.45';
import { renderTally } from './windows/tally.js?v=0.2.45';
import { renderTallyHud } from './widgets/tally-hud.js?v=0.2.45';

/* A renderer with `.patch` is a component: built once, then patched in place (src/shell/shell.js). */
export const WINDOW_RENDERERS = Object.freeze({
  hunts: renderHunts,
  inventory: renderInventory,
  character: renderCharacter,
  'skills-trade': renderWork,
  storage: renderStorage,
  shop: renderShop,
  services: renderServices,
  farm: renderFarm,
  tally: renderTally,
  house: renderHouse,
  'hunt-prep': renderHuntPrep,
  'hunt-party': renderParty,
  characters: renderCharacters,
  'hunt-summary': renderHuntSummary,
  hud: renderHudSettings,
  'configure-action': renderConfigureAction,
  death: renderDeath,
  chat: renderChat,
  friends: renderFriends,
  inspect: renderInspect,
  settings: renderSettings,
  report: renderReport,
});

export const WIDGET_RENDERERS = Object.freeze({
  launchers: renderLaunchers,
  alerts: renderAlerts,
  'hunt-topbar': renderHuntTopbar,
  party: renderPartyPanel,
  analyzer: renderAnalyzer,
  'action-bar': renderActionBar,
  online: renderOnline,
  tally: renderTallyHud,
});
