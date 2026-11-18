// ════════════════════════════════════════════════════════════════════════
// src/shell/renderers.js — ONE RENDERER PER ROW, AND ONE ROW PER RENDERER.
//
// A window or a widget is a data row (src/data/shell-windows.js,
// src/data/hud-widgets.js) plus an entry here under the same id. A renderer
// takes the shell context ({wm, hud, glyphs, G, refresh}) and returns the body
// HTML. tests/shell-renderers.mjs fails the build on a row with no renderer or
// a renderer with no row, so a launcher can never open an empty window.
// ════════════════════════════════════════════════════════════════════════
import { renderLaunchers } from './launcher.js?v=0.2.140';
import { renderHudSettings } from './hud.js?v=0.2.140';
import { renderHuntTopbar } from './widgets/hunt-topbar.js?v=0.2.140';
import { renderBossBar } from './widgets/boss-bar.js?v=0.2.140';
import { renderPartyPanel } from './widgets/party-panel.js?v=0.2.140';
import { renderAnalyzer } from './widgets/analyzer.js?v=0.2.140';
import { renderActionBar } from './widgets/action-bar.js?v=0.2.140';
import { renderConfigureAction } from './windows/configure-action.js?v=0.2.140';
import { renderChat } from './windows/chat.js?v=0.2.140';
import { renderFriends } from './windows/friends.js?v=0.2.140';
import { renderInspect } from './windows/inspect.js?v=0.2.140';
import { renderSettings } from './windows/settings.js?v=0.2.140';
import { renderInventory } from './windows/inventory/index.js?v=0.2.140';
import { renderWork } from './windows/work.js?v=0.2.140';
import { renderCharacter } from './windows/character/index.js?v=0.2.140';
import { renderHunts } from './windows/hunts.js?v=0.2.140';
import { renderStorage } from './windows/storage.js?v=0.2.140';
import { renderShop } from './windows/shop.js?v=0.2.140';
import { renderMarket } from './windows/market/index.js?v=0.2.140';
import { renderHuntPrep } from './windows/hunt-prep.js?v=0.2.140';
import { renderParty } from './windows/party.js?v=0.2.140';
import { renderCharacters } from './windows/characters.js?v=0.2.140';
import { renderAlerts } from './widgets/alerts.js?v=0.2.140';
import { renderHuntSummary } from './windows/hunt-summary.js?v=0.2.140';
import { renderAway } from './windows/away.js?v=0.2.140';
import { renderReport } from './windows/report.js?v=0.2.140';
import { renderDeath } from './windows/death.js?v=0.2.140';
import { renderPlayCap } from './windows/play-cap.js?v=0.2.140';
import { renderOnline } from './widgets/online.js?v=0.2.140';
import { renderEventPlate } from './widgets/event-plate.js?v=0.2.140';
import { renderHouse } from './windows/house.js?v=0.2.140';
import { renderFarm } from './windows/farm.js?v=0.2.140';
import { renderTally } from './windows/tally.js?v=0.2.140';
import { renderHonor } from './windows/honor.js?v=0.2.140';
import { renderHavora } from './windows/havora/index.js?v=0.2.140';
import { renderTallyHud } from './widgets/tally-hud.js?v=0.2.140';
import { renderMonster } from './windows/monster.js?v=0.2.140';
import { renderGameMaster } from './windows/game-master.js?v=0.2.140';

/* A renderer with `.patch` is a component: built once, then patched in place (src/shell/shell.js). */import { renderWiki } from './windows/wiki.js?v=0.2.140';
import { renderTraining } from './windows/training.js?v=0.2.140';
import { renderFactionJoin } from './windows/faction-join.js?v=0.2.140';
import { renderTower } from './windows/tower.js?v=0.2.140';

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
  training: renderTraining,
  tower: renderTower,
  'hunt-prep': renderHuntPrep,
  'hunt-party': renderParty,
  characters: renderCharacters,
  'hunt-summary': renderHuntSummary,
  away: renderAway,
  hud: renderHudSettings,
  'configure-action': renderConfigureAction,
  death: renderDeath,
  'play-cap': renderPlayCap,
  'faction-join': renderFactionJoin,
  chat: renderChat,
  friends: renderFriends,
  inspect: renderInspect,
  settings: renderSettings,
  report: renderReport,
  'game-master': renderGameMaster,
  monster: renderMonster,
  wiki: renderWiki,
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
  events: renderEventPlate,
  tally: renderTallyHud,
});
