// ════════════════════════════════════════════════════════════════════════
// src/shell/renderers.js — ONE RENDERER PER ROW, AND ONE ROW PER RENDERER.
//
// A window or a widget is a data row (src/data/shell-windows.js,
// src/data/hud-widgets.js) plus an entry here under the same id. A renderer
// takes the shell context ({wm, hud, glyphs, G, refresh}) and returns the body
// HTML. tests/shell-renderers.mjs fails the build on a row with no renderer or
// a renderer with no row, so a launcher can never open an empty window.
// ════════════════════════════════════════════════════════════════════════
import { renderLaunchers } from './launcher.js?v=0.2.103';
import { renderHudSettings } from './hud.js?v=0.2.103';
import { renderHuntTopbar } from './widgets/hunt-topbar.js?v=0.2.103';
import { renderBossBar } from './widgets/boss-bar.js?v=0.2.103';
import { renderPartyPanel } from './widgets/party-panel.js?v=0.2.103';
import { renderAnalyzer } from './widgets/analyzer.js?v=0.2.103';
import { renderActionBar } from './widgets/action-bar.js?v=0.2.103';
import { renderConfigureAction } from './windows/configure-action.js?v=0.2.103';
import { renderChat } from './windows/chat.js?v=0.2.103';
import { renderFriends } from './windows/friends.js?v=0.2.103';
import { renderInspect } from './windows/inspect.js?v=0.2.103';
import { renderSettings } from './windows/settings.js?v=0.2.103';
import { renderInventory } from './windows/inventory/index.js?v=0.2.103';
import { renderWork } from './windows/work.js?v=0.2.103';
import { renderCharacter } from './windows/character/index.js?v=0.2.103';
import { renderHunts } from './windows/hunts.js?v=0.2.103';
import { renderStorage } from './windows/storage.js?v=0.2.103';
import { renderShop } from './windows/shop.js?v=0.2.103';
import { renderMarket } from './windows/market/index.js?v=0.2.103';
import { renderHuntPrep } from './windows/hunt-prep.js?v=0.2.103';
import { renderParty } from './windows/party.js?v=0.2.103';
import { renderCharacters } from './windows/characters.js?v=0.2.103';
import { renderAlerts } from './widgets/alerts.js?v=0.2.103';
import { renderHuntSummary } from './windows/hunt-summary.js?v=0.2.103';
import { renderReport } from './windows/report.js?v=0.2.103';
import { renderDeath } from './windows/death.js?v=0.2.103';
import { renderPlayCap } from './windows/play-cap.js?v=0.2.103';
import { renderOnline } from './widgets/online.js?v=0.2.103';
import { renderHouse } from './windows/house.js?v=0.2.103';
import { renderFarm } from './windows/farm.js?v=0.2.103';
import { renderTally } from './windows/tally.js?v=0.2.103';
import { renderHonor } from './windows/honor.js?v=0.2.103';
import { renderHavora } from './windows/havora/index.js?v=0.2.103';
import { renderTallyHud } from './widgets/tally-hud.js?v=0.2.103';
import { renderGameMaster } from './windows/game-master.js?v=0.2.103';

/* A renderer with `.patch` is a component: built once, then patched in place (src/shell/shell.js). */
export const WINDOW_RENDERERS = Object.freeze({
  hunts: renderHunts,
  inventory: renderInventory,
  character: renderCharacter,
  'skills-trade': renderWork,
  storage: renderStorage,
  shop: renderShop,
  market: renderMarket,
  farm: renderFarm,
  tally: renderTally,
  honor: renderHonor,
  havora: renderHavora,
  house: renderHouse,
  'hunt-prep': renderHuntPrep,
  'hunt-party': renderParty,
  characters: renderCharacters,
  'hunt-summary': renderHuntSummary,
  hud: renderHudSettings,
  'configure-action': renderConfigureAction,
  death: renderDeath,
  'play-cap': renderPlayCap,
  chat: renderChat,
  friends: renderFriends,
  inspect: renderInspect,
  settings: renderSettings,
  report: renderReport,
  'game-master': renderGameMaster,
});

export const WIDGET_RENDERERS = Object.freeze({
  launchers: renderLaunchers,
  alerts: renderAlerts,
  'hunt-topbar': renderHuntTopbar,
  'boss-bar': renderBossBar,
  party: renderPartyPanel,
  analyzer: renderAnalyzer,
  'action-bar': renderActionBar,
  online: renderOnline,
  tally: renderTallyHud,
});
