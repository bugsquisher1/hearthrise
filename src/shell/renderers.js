// ════════════════════════════════════════════════════════════════════════
// src/shell/renderers.js — ONE RENDERER PER ROW, AND ONE ROW PER RENDERER.
//
// A window or a widget is a data row (src/data/shell-windows.js,
// src/data/hud-widgets.js) plus an entry here under the same id. A renderer
// takes the shell context ({wm, hud, glyphs, G, refresh}) and returns the body
// HTML. tests/shell-renderers.mjs fails the build on a row with no renderer or
// a renderer with no row, so a launcher can never open an empty window.
// ════════════════════════════════════════════════════════════════════════
import { renderLaunchers } from './launcher.js';
import { renderHudSettings } from './hud.js';
import { renderHuntTopbar } from './widgets/hunt-topbar.js';
import { renderBossBar } from './widgets/boss-bar.js';
import { renderPartyPanel } from './widgets/party-panel.js';
import { renderAnalyzer } from './widgets/analyzer.js';
import { renderActionBar } from './widgets/action-bar.js';
import { renderConfigureAction } from './windows/configure-action.js';
import { renderChat } from './windows/chat.js';
import { renderFriends } from './windows/friends.js';
import { renderClan } from './windows/clan.js';
import { renderInspect } from './windows/inspect.js';
import { renderSettings } from './windows/settings.js';
import { renderInventory } from './windows/inventory/index.js';
import { renderWork } from './windows/work.js';
import { renderCharacter } from './windows/character/index.js';
import { renderHunts } from './windows/hunts.js';
import { renderStorage } from './windows/storage.js';
import { renderShop } from './windows/shop.js';
import { renderMarket } from './windows/market/index.js';
import { renderHuntPrep } from './windows/hunt-prep.js';
import { renderParty } from './windows/party.js';
import { renderCharacters } from './windows/characters.js';
import { renderAlerts } from './widgets/alerts.js';
import { renderHuntSummary } from './windows/hunt-summary.js';
import { renderAway } from './windows/away.js';
import { renderReport } from './windows/report.js';
import { renderDeath } from './windows/death.js';
import { renderPlayCap } from './windows/play-cap.js';
import { renderOnline } from './widgets/online.js';
import { renderEventPlate } from './widgets/event-plate.js';
import { renderHouse } from './windows/house.js';
import { renderFarm } from './windows/farm.js';
import { renderTally } from './windows/tally.js';
import { renderHonor } from './windows/honor.js';
import { renderHavora } from './windows/havora/index.js';
import { renderTallyHud } from './widgets/tally-hud.js';
import { renderMonster } from './windows/monster.js';
import { renderGameMaster } from './windows/game-master.js';

/* A renderer with `.patch` is a component: built once, then patched in place (src/shell/shell.js). */import { renderWiki } from './windows/wiki.js';
import { renderTraining } from './windows/training.js';
import { renderFactionJoin } from './windows/faction-join.js';
import { renderTower } from './windows/tower.js';
import { renderTalents } from './windows/talents.js';

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
  talents: renderTalents,
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
  clan: renderClan,
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
