// ════════════════════════════════════════════════════════════════════════
// src/shell/training-words.js — COMBAT TRAINING'S LABELS, WITH THE SERVER'S OWN NUMBERS.
//
// PURE. Every line is a row of src/data/text/training.js; this fills it from the `training` section
// (src/session/training-sections.js) or a refusal's figures (src/session/training-intents.js). A refusal with no
// number reads from src/data/refusal-words.js; src/shell/intent-words.js refusalText asks here first.
// ════════════════════════════════════════════════════════════════════════
import { t } from '../render/player-text.js?v=0.2.136';
import { whole } from '../render/format.js?v=0.2.136';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.136';
import { TRAINING_RULES } from '../data/training.js?v=0.2.136';

const MINUTE = 60000;
const num = (v) => Number.isSafeInteger(v);

/** A skill's player name ("Defense"); an id the catalogue doesn't know reads as itself. */
export const skillWord = (id) => (SKILLS_DEF[id] && SKILLS_DEF[id].name) || String(id);

/** "3 hours 20 minutes", "1 hour", "45 minutes", "less than a minute": a span, to the minute (rounded down). */
export function timeWords(ms) {
  const m = Math.floor(Math.max(0, Number(ms) || 0) / MINUTE);
  if (m < 1) return t('training.time_under_minute');
  const h = Math.floor(m / 60), r = m % 60;
  const hours = h ? t('training.time_hours', { count: h }) : '', minutes = r ? t('training.time_minutes', { count: r }) : '';
  return h && r ? t('training.time_both', { hours, minutes }) : hours || minutes;
}

/** Why the last session ended, as a label ("Training ended (out of gold)"), or '' when there is none. Never a hunt's words: any other
    end (a quiet stretch, the server's stop) reads "Training ended". */
export function endedWords(last) {
  if (!last) return '';
  if (last.reason === 'gold_out') return t('training.ended_gold_out');
  if (last.reason === 'hours') return t('training.ended_hours', { hours: TRAINING_RULES.maxHours });
  if (last.reason === 'left') return t('training.ended_left');
  return t('training.ended_other');
}

/** A training refusal that carries the server's numbers, as a label, or null (the shared table then says it). */
export function trainingRefusal(r) {
  if (r && (r.verb === 'training_gear_buy' || r.verb === 'training_gear_open' || r.verb === 'training_gear_switch')) return gearRefusal(r);
  if (!r || (r.verb !== 'training_start' && r.verb !== 'house_dummy')) return null;
  if (r.error === 'insufficient_gold' && num(r.fee) && num(r.purse)) return t('training.short_gold', { fee: whole(r.fee), purse: whole(r.purse) });
  if (r.error === 'insufficient_gold' && num(r.price) && num(r.purse)) return t('training.dummy_short', { price: whole(r.price), purse: whole(r.purse) });
  if (r.error === 'dummy_busy' && r.busy) return t('training.dummy_busy', { who: r.busy });
  if (r.error === 'hunt_open') return t('training.hunting');
  if (r.error === 'in_party') return t('training.in_party');
  if (r.error === 'dummy_max') return t('training.dummy_all');
  return null;
}

/* The training items' refusals (2027-04-23-training-gear.sql), with the server's own numbers where it sends them. */
function gearRefusal(r) {
  if (r.error === 'insufficient_gold' && num(r.price) && num(r.purse)) return t('training.gear_short', { price: whole(r.price), purse: whole(r.purse) });
  if (r.error === 'buy_limit' && num(r.max)) return t('training.gear_limit', { max: r.max });
  if (r.error === 'still_open') return t('training.gear_still_open');
  if (r.error === 'none_held') return t('training.gear_none_held');
  if (r.error === 'feature_off' || r.error === 'not_for_sale') return t('training.gear_closed');
  return null;
}
