// ════════════════════════════════════════════════════════════════════════
// src/shell/tower-words.js — THE BURNING TOWER AND THE HEARTH CHEST IN PLAIN WORDS, WITH THE SERVER'S OWN NUMBERS.
//
// PURE. Every sentence is a row of src/data/text/tower.js; this fills them from the `tower` section (src/session/tower-sections.js) or
// an answer's figures (src/session/tower-intents.js). A chance is the server's parts per million, written as a player reads a drop
// chance (render/format.js chance). A refusal with no number reads from src/data/refusal-words.js; src/shell/intent-words.js
// refusalText asks here first.
// ════════════════════════════════════════════════════════════════════════
import { t, hasText } from '../render/player-text.js?v=0.2.133';
import { chance, whole } from '../render/format.js?v=0.2.133';
import { itemName } from './widgets/bits.js?v=0.2.133';
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.133';

const VERBS = Object.freeze(['tower_start', 'chest_open', 'chest_stoke_default']);
const num = (v) => Number.isSafeInteger(v) && v >= 0;

/** The Havora window's Hearth tab press into the Tower window (hidden until the window shows it: the server's section). */
export const towerDoorHtml = () => '<p class="hv-tower" hidden>'
  + '<button type="button" class="hh-tool" data-hs-act="tower">' + esc(t('tower.havora_open')) + '</button></p>';

/** A chance in parts per million as a player reads it ("16%", "2.4%"), or '' when the server sent none. */
export const ppmWords = (ppm) => (num(ppm) ? chance(ppm / 1000000) : '');

/** "Bow", by the server's weapon family id; a family this client has no words for reads as its id spelled out. */
export const familyWord = (id) => (hasText('tower.family_' + id) ? t('tower.family_' + id) : String(id || '').replace(/_/g, ' '));

/** "Tower Keys", from a key family row: the server's own name for it (hr_chest_key_families.name), or its id spelled out when it sent
    none, so a family the server adds (the catacombs') draws its row with no words added here. */
export const keyFamilyWord = (f) => t('tower.key_family', { name: (f && (f.name || String(f.family || '').replace(/_/g, ' '))) || '' });

/** How many stokes, as a button says it ("None", "Once", "Twice", "3 times"). */
export const stokeLabel = (n) => (n === 0 ? t('tower.stoke_none') : n === 1 ? t('tower.stoke_1') : n === 2 ? t('tower.stoke_2') : t('tower.stoke_n', { count: n }));

/** A multiplier in permille as a player reads it: 1700 -> "1.7", 2500 -> "2.5", 3000 -> "3". */
export const timesWords = (pm) => (num(pm) ? String(Math.round(pm / 100) / 10) : '');

/** A loot list, one label an item ("Tempering Salts x15", "Hearth Cinders x50"), from { item: qty } (the server's own row). */
export function lootList(items) {
  return Object.entries(items || {}).filter(([, q]) => num(q) && q > 0).map(([id, q]) => t('tower.loot_item', { item: itemName(id), count: whole(q) }));
}

/**
 * THE END CARD OF A CLIMB, one label a row, or null for a card that is no climb. `tw` is the `tower` section (its `last` run is the
 * newest climb that ended, the server's floors and keys); `card` the summary (summary-model.js: id, hunt, reason). A climb never says
 * "died": "Spat out" (the board's §1 "In the game's words"). The run's numbers only when the section's last run IS this card's session;
 * an older card says the bare label.
 */
export function climbEndLines(tw, card, towerHunt) {
  if (!card || card.hunt !== towerHunt) return null;
  const run = tw && tw.last && tw.last.session === String(card.id).toLowerCase() ? tw.last : null;
  const lines = [];
  /* the floor it ended on: the one after the last it cleared, or the one it started on */
  const on = run ? (run.top !== null ? run.top + 1 : run.start) : null;
  if (card.reason === 'died') lines.push(on !== null ? t('tower.end_spat', { floor: on }) : t('tower.end_spat_plain'));
  else if (card.reason === 'floor_time') lines.push(t('tower.end_time'));
  else lines.push(null);
  /* the mode's own death loss, the server's: none in the Tower */
  if (card.reason === 'died' && tw && tw.pays && tw.pays.deathLossPm === 0) lines.push(t('tower.end_xp'));
  if (run) lines.push(run.top !== null ? t('tower.end_climbed', { from: run.start, to: run.top }) : t('tower.end_no_floor'));
  /* every landing a run clears mints its key (no weekly earn cap, Tyler 2026-11-16): one entry a kind, "Bronze Key x2" */
  const named = run ? run.keys.map((k) => keyName(tw, k.key)).filter(Boolean) : [];
  const kinds = [...new Set(named)].map((n) => { const c = named.filter((x) => x === n).length; return c > 1 ? t('tower.end_key_count', { key: n, count: c }) : n; });
  if (named.length) lines.push(t('tower.end_keys', { list: kinds.join(', ') }));
  /* the keys the family's held limit kept back (the mint's tower_key_withheld rows): the card says why they did not drop */
  if (run && run.withheld > 0) lines.push(t('tower.end_withheld', { count: run.withheld }));
  return { lines, keys: named.length };
}
const keyName = (tw, id) => { const k = tw && tw.chest ? tw.chest.keys.find((x) => x.key === id) : null; return k ? k.name || itemName(k.item) : null; };

/**
 * A Tower refusal that carries the server's numbers or needs the Tower's own words, as a label, or null (the shared table says it).
 * week_limit { family, used, limit } is the key family's week of chests (2027-04-27-tower-chest.sql, Tyler 2026-11-16).
 */
export function towerRefusal(r) {
  if (!r || !VERBS.includes(r.verb)) return null;
  if (r.error === 'bad_landing') return t('tower.bad_floor');
  if (r.error === 'party_hunting') return t('tower.off_party_hunting');
  if (r.error === 'hunt_open' || r.error === 'activity_running' || r.error === 'in_hunt') return t('tower.off_hunting');
  if (r.error === 'no_key') return t('tower.off_no_key');
  if (r.error === 'week_limit' && num(r.limit)) return t('tower.off_week', { max: r.limit });
  if (r.error === 'chest_not_ready') return t('tower.not_ready');
  return null;
}
