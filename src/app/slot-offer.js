// ════════════════════════════════════════════════════════════════════════
// src/app/slot-offer.js — THE HERO SLOTS LINE ON "YOUR CHARACTERS".
//
// Every account owns all four hero slots from its first second (Tyler 2026-11-21; 1036-four-starter-slots.sql), so
// nothing is for sale and the line only says how many heroes the account can field and play at once. Every number is
// the server's: the play-at-once limit from the envelope (AccountSession.statedLimit / limit), the slots from the
// roster it read (hr_load per owned slot). Nothing here is authority.
// ONE HERO FIRST (Tyler RD-Q6 a, 2026-11-22): the screen shows the account's heroes and never an empty slot beside them. An
// account with no hero sees ONE empty slot, its first. The rest of the company comes in one press at Level 5
// (1053-recruits.sql; src/shell/windows/recruits-pane.js), so the empty slots are not on the first screen (rowsShown).
//
// PURE: strings in, strings out. src/app/boot.js mounts it.
// ════════════════════════════════════════════════════════════════════════

import { t } from '../render/player-text.js';

/**
 * The roster rows the characters screen shows: every hero (and a hero still to be named), and an empty slot only while the account
 * has no hero, its first owned one. Pure.
 * @param rows  AccountSession.roster() rows
 */
export function rowsShown(rows) {
  const all = (Array.isArray(rows) ? rows : []).filter((r) => r && Number.isInteger(r.slot));
  const held = all.filter((r) => r.exists || r.unnamed);
  return held.length ? held : all.slice(0, 1);
}

/**
 * The line above the roster: how many may play at once and how many heroes this account can still make. '' until the
 * server has said. Pure.
 * @param stated  AccountSession.statedLimit(): the server's limit, or null
 * @param limit   AccountSession.limit(): that, under the tab's ceiling
 * @param rows    AccountSession.roster() rows: every slot the account owns, `exists` when a hero is in it
 */
export function playLineOf(stated, limit, rows) {
  if (stated === null) return '';
  if (stated <= 1) return t('slots.play_one');
  const most = Math.min(stated, limit);
  const empty = (Array.isArray(rows) ? rows : []).filter((r) => r && !r.exists).length;
  return empty ? t('slots.play_to_make', { most, count: empty }) : t('slots.play_up_to', { most });
}
