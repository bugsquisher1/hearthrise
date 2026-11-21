// ════════════════════════════════════════════════════════════════════════
// src/app/slot-offer.js — THE HERO SLOTS LINE ON "YOUR CHARACTERS".
//
// Every account owns all four hero slots from its first second (Tyler 2026-11-21; 1036-four-starter-slots.sql), so
// nothing is for sale and the line only says how many heroes the account can field and play at once. Every number is
// the server's: the play-at-once limit from the envelope (AccountSession.statedLimit / limit), the slots from the
// roster it read (hr_load per owned slot). Nothing here is authority.
//
// PURE: strings in, strings out. src/app/boot.js mounts it.
// ════════════════════════════════════════════════════════════════════════

import { t } from '../render/player-text.js';

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
