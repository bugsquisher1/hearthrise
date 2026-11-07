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
import { FARM_TEXT } from './farm.js?v=0.2.106';

export const TEXT = Object.freeze({
  farm: FARM_TEXT,
});
