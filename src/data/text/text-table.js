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
import { AWAY_TEXT } from './away.js?v=0.2.122';
import { BAG_TEXT } from './bag.js?v=0.2.122';
import { BAR_TEXT } from './bar.js?v=0.2.122';
import { COACH_TEXT } from './coach.js?v=0.2.122';
import { CONTROLS_TEXT } from './controls.js?v=0.2.122';
import { CRIERS_TEXT } from './criers.js?v=0.2.122';
import { DEATH_TEXT } from './death.js?v=0.2.122';
import { EVENTS_TEXT } from './events.js?v=0.2.122';
import { FARM_TEXT } from './farm.js?v=0.2.122';
import { HEROES_TEXT } from './heroes.js?v=0.2.122';
import { HOUSE_TEXT } from './house.js?v=0.2.122';
import { HUNTS_TEXT } from './hunts.js?v=0.2.122';
import { ITEM_TEXT } from './item.js?v=0.2.122';
import { MONSTER_TEXT } from './monster.js?v=0.2.122';
import { PARTY_TEXT } from './party.js?v=0.2.122';
import { PREP_TEXT } from './prep.js?v=0.2.122';
import { SHOP_TEXT } from './shop.js?v=0.2.122';
import { SLOTS_TEXT } from './slots.js?v=0.2.122';
import { TALLY_TEXT } from './tally.js?v=0.2.122';
import { TEMPER_TEXT } from './temper.js?v=0.2.122';
import { WORK_TEXT } from './work.js?v=0.2.122';

export const TEXT = Object.freeze({
  away: AWAY_TEXT,
  bag: BAG_TEXT,
  bar: BAR_TEXT,
  coach: COACH_TEXT,
  controls: CONTROLS_TEXT,
  criers: CRIERS_TEXT,
  death: DEATH_TEXT,
  events: EVENTS_TEXT,
  farm: FARM_TEXT,
  heroes: HEROES_TEXT,
  house: HOUSE_TEXT,
  hunts: HUNTS_TEXT,
  item: ITEM_TEXT,
  monster: MONSTER_TEXT,
  party: PARTY_TEXT,
  prep: PREP_TEXT,
  shop: SHOP_TEXT,
  slots: SLOTS_TEXT,
  tally: TALLY_TEXT,
  temper: TEMPER_TEXT,
  work: WORK_TEXT,
});
