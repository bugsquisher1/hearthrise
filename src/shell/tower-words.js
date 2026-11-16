// ════════════════════════════════════════════════════════════════════════
// src/shell/tower-words.js — THE BURNING TOWER AND THE HEARTH CHEST IN PLAIN WORDS, WITH THE SERVER'S OWN NUMBERS.
//
// PURE. Every sentence is a row of src/data/text/tower.js; this fills them from the `tower` section (src/session/tower-sections.js) or
// an answer's figures (src/session/tower-intents.js). A chance is the server's parts per million, written as a player reads a drop
// chance (render/format.js chance). A refusal with no number reads from src/data/refusal-words.js; src/shell/intent-words.js
// refusalText asks here first.
// ════════════════════════════════════════════════════════════════════════
import { t, hasText } from '../render/player-text.js?v=0.2.132';
import { chance, listWords, whole } from '../render/format.js?v=0.2.132';
import { itemName } from './widgets/bits.js?v=0.2.132';

const VERBS = Object.freeze(['tower_start', 'chest_open', 'chest_stoke_default']);
const num = (v) => Number.isSafeInteger(v) && v >= 0;

/** A chance in parts per million as a player reads it ("16%", "2.4%"), or '' when the server sent none. */
export const ppmWords = (ppm) => (num(ppm) ? chance(ppm / 1000000) : '');

/** "a bow", by the server's family id; a family this client has no words for reads as its id spelled out. */
export const familyWord = (id) => (hasText('tower.family_' + id) ? t('tower.family_' + id) : String(id || '').replace(/_/g, ' '));

/** How many stokes, as a button says it ("None", "Once", "Twice", "3 times"). */
export const stokeLabel = (n) => (n === 0 ? t('tower.stoke_none') : n === 1 ? t('tower.stoke_1') : n === 2 ? t('tower.stoke_2') : t('tower.stoke_n', { count: n }));
/** ... and inside a sentence ("once", "twice", "3 times"). */
export const stokeWord = (n) => (n === 1 ? t('tower.stoke_word_1') : n === 2 ? t('tower.stoke_word_2') : t('tower.stoke_word_n', { count: n }));

/** A multiplier in permille as a player reads it: 1700 -> "1.7", 2500 -> "2.5", 3000 -> "3". */
export const timesWords = (pm) => (num(pm) ? String(Math.round(pm / 100) / 10) : '');

/** "50 Tower Cinders, 15 Tempering Salts and 20 Cooked Shrimp" from { item: qty } (the server's own row). */
export function haulWords(items) {
  const rows = Object.entries(items || {}).filter(([, q]) => num(q) && q > 0);
  return listWords(rows.map(([id, q]) => whole(q) + ' ' + itemName(id)), Infinity);
}

/** The floors as a list a player reads: "floor 10", "floors 10 and 20", "floors 10, 20 and 30". */
export function floorList(list) {
  const f = (list || []).filter((x) => Number.isSafeInteger(x));
  if (!f.length) return '';
  return t(f.length === 1 ? 'tower.floor_one' : 'tower.floor_many', { list: listWords(f.map(String), Infinity) });
}

/** A Tower refusal that carries the server's numbers or needs the Tower's own words, in a sentence, or null (the shared table says it). */
export function towerRefusal(r, name) {
  if (!r || !VERBS.includes(r.verb)) return null;
  const who = typeof name === 'string' && name ? name : t('training.your_hero');
  if (r.error === 'bad_floor') return t('tower.bad_floor');
  if (r.error === 'in_party') return t('tower.off_party');
  if (r.error === 'hunt_open' || r.error === 'activity_running') return t('tower.off_hunting', { name: who });
  if (r.error === 'in_hunt') return t('tower.off_out', { name: who });
  if (r.error === 'no_key') return t('tower.off_no_key');
  if (r.error === 'day_limit' && num(r.max)) return t('tower.off_day', { max: r.max });
  if (r.error === 'chest_not_ready') return t('tower.not_ready');
  return null;
}
