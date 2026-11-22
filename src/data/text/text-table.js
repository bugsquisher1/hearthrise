// ════════════════════════════════════════════════════════════════════════
// src/data/text/text-table.js — ONE HOME FOR EVERY WORD A PLAYER READS.
//
// One file per surface under src/data/text/, each a frozen map of key →
// sentence; this table names them, so an id reads 'surface.key'. Reviewing
// the words, linting them (tests/copy-lint.mjs) and translating them later
// are one job over one place. src/render/player-text.js is the only reader;
// tests/text-home.mjs keeps every call site honest and ratchets the text
// still written in code down to none.
// ════════════════════════════════════════════════════════════════════════
import { AWAY_TEXT } from './away.js';
import { BAG_TEXT } from './bag.js';
import { BAR_TEXT } from './bar.js';
import { CATACOMB_TEXT } from './catacomb.js';
import { CHRONICLE_TEXT } from './chronicle.js';
import { CLAN_TEXT } from './clan.js';
import { COACH_TEXT } from './coach.js';
import { CONTROLS_TEXT } from './controls.js';
import { CRIERS_TEXT } from './criers.js';
import { DEATH_TEXT } from './death.js';
import { EVENTS_TEXT } from './events.js';
import { FACTIONS_TEXT } from './factions.js';
import { FARM_TEXT } from './farm.js';
import { HEROES_TEXT } from './heroes.js';
import { HOUSE_TEXT } from './house.js';
import { HUD_TEXT } from './hud.js';
import { HUNTS_TEXT } from './hunts.js';
import { ITEM_TEXT } from './item.js';
import { JEWEL_TEXT } from './jewel.js';
import { MONSTER_TEXT } from './monster.js';
import { LOG_TEXT } from './log.js';
import { PARTY_TEXT } from './party.js';
import { PEOPLE_TEXT } from './people.js';
import { PREP_TEXT } from './prep.js';
import { REPORT_TEXT } from './report.js';
import { SHOP_TEXT } from './shop.js';
import { SLOTS_TEXT } from './slots.js';
import { SUMMARY_TEXT } from './summary.js';
import { TALLY_TEXT } from './tally.js';
import { TEMPER_TEXT } from './temper.js';
import { WINDOWS_TEXT } from './windows.js';
import { WIKI_TEXT } from './wiki.js';
import { WORK_TEXT } from './work.js';
import { TRAINING_TEXT } from './training.js';
import { TOWER_TEXT } from './tower.js';

export const TEXT = Object.freeze({
  away: AWAY_TEXT,
  bag: BAG_TEXT,
  bar: BAR_TEXT,
  catacomb: CATACOMB_TEXT,
  chronicle: CHRONICLE_TEXT,
  clan: CLAN_TEXT,
  coach: COACH_TEXT,
  controls: CONTROLS_TEXT,
  criers: CRIERS_TEXT,
  death: DEATH_TEXT,
  events: EVENTS_TEXT,
  factions: FACTIONS_TEXT,
  farm: FARM_TEXT,
  heroes: HEROES_TEXT,
  house: HOUSE_TEXT,
  hud: HUD_TEXT,
  hunts: HUNTS_TEXT,
  item: ITEM_TEXT,
  jewel: JEWEL_TEXT,
  log: LOG_TEXT,
  monster: MONSTER_TEXT,
  party: PARTY_TEXT,
  people: PEOPLE_TEXT,
  prep: PREP_TEXT,
  report: REPORT_TEXT,
  shop: SHOP_TEXT,
  slots: SLOTS_TEXT,
  summary: SUMMARY_TEXT,
  tally: TALLY_TEXT,
  temper: TEMPER_TEXT,
  tower: TOWER_TEXT,
  training: TRAINING_TEXT,
  windows: WINDOWS_TEXT,
  wiki: WIKI_TEXT,
  work: WORK_TEXT,
});
