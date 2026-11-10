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
import { BAR_TEXT } from './bar.js?v=0.2.114';
import { COACH_TEXT } from './coach.js?v=0.2.114';
import { DEATH_TEXT } from './death.js?v=0.2.114';
import { FARM_TEXT } from './farm.js?v=0.2.114';
import { HEROES_TEXT } from './heroes.js?v=0.2.114';
import { HOUSE_TEXT } from './house.js?v=0.2.114';
import { HUNTS_TEXT } from './hunts.js?v=0.2.114';
import { ITEM_TEXT } from './item.js?v=0.2.114';
import { MONSTER_TEXT } from './monster.js?v=0.2.114';
import { PREP_TEXT } from './prep.js?v=0.2.114';
import { SHOP_TEXT } from './shop.js?v=0.2.114';
import { SLOTS_TEXT } from './slots.js?v=0.2.114';
import { TEMPER_TEXT } from './temper.js?v=0.2.114';

export const TEXT = Object.freeze({
  bar: BAR_TEXT,
  coach: COACH_TEXT,
  death: DEATH_TEXT,
  farm: FARM_TEXT,
  heroes: HEROES_TEXT,
  house: HOUSE_TEXT,
  hunts: HUNTS_TEXT,
  item: ITEM_TEXT,
  monster: MONSTER_TEXT,
  prep: PREP_TEXT,
  shop: SHOP_TEXT,
  slots: SLOTS_TEXT,
  temper: TEMPER_TEXT,
});
