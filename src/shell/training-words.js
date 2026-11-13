// ════════════════════════════════════════════════════════════════════════
// src/shell/training-words.js — COMBAT TRAINING IN PLAIN WORDS, WITH THE SERVER'S OWN NUMBERS.
//
// PURE. Every sentence is a row of src/data/text/training.js; this fills it from the `training` section
// (src/session/training-sections.js) or a refusal's figures (src/session/training-intents.js). A refusal with no
// number reads from src/data/refusal-words.js; src/shell/intent-words.js refusalText asks here first.
// ════════════════════════════════════════════════════════════════════════
import { t } from '../render/player-text.js?v=0.2.126';
import { whole } from '../render/format.js?v=0.2.126';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.126';

const MINUTE = 60000;
const num = (v) => Number.isSafeInteger(v);

/** A skill's player name ("Defense"); an id the catalogue doesn't know reads as itself. */
export const skillWord = (id) => (SKILLS_DEF[id] && SKILLS_DEF[id].name) || String(id);
const nameWord = (name) => (typeof name === 'string' && name ? name : t('training.your_hero'));

/** "3 hours 20 minutes", "1 hour", "45 minutes", "less than a minute": a span, to the minute (rounded down). */
export function timeWords(ms) {
  const m = Math.floor(Math.max(0, Number(ms) || 0) / MINUTE);
  if (m < 1) return t('training.time_under_minute');
  const h = Math.floor(m / 60), r = m % 60;
  const hours = h ? t('training.time_hours', { count: h }) : '', minutes = r ? t('training.time_minutes', { count: r }) : '';
  return h && r ? t('training.time_both', { hours, minutes }) : hours || minutes;
}

/** Why the last session ended, or '' when there is none. */
export function endedWords(last, name) {
  if (!last) return '';
  const o = { name: nameWord(name), skill: skillWord(last.skill) };
  if (last.reason === 'gold_out') return t('training.ended_gold_out', o);
  if (last.reason === 'hours') return t('training.ended_hours', o);
  if (last.reason === 'left') return t('training.ended_left', o);
  return t('training.ended_other', o);
}

/** A training refusal that carries the server's numbers, in a sentence, or null (the shared table then says it). */
export function trainingRefusal(r, name) {
  if (!r || (r.verb !== 'training_start' && r.verb !== 'house_dummy')) return null;
  const who = nameWord(name);
  if (r.error === 'insufficient_gold' && num(r.fee) && num(r.purse)) return t('training.short_gold', { fee: whole(r.fee), purse: whole(r.purse) });
  if (r.error === 'insufficient_gold' && num(r.price) && num(r.purse)) return t('training.dummy_short', { price: whole(r.price), purse: whole(r.purse) });
  if (r.error === 'dummy_busy' && r.busy) return t('training.dummy_busy', { who: r.busy });
  if (r.error === 'hunt_open') return t('training.hunting', { name: who });
  if (r.error === 'in_party') return t('training.in_party', { name: who });
  if (r.error === 'dummy_max') return t('training.dummy_all');
  return null;
}
