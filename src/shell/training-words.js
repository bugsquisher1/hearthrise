// ════════════════════════════════════════════════════════════════════════
// src/shell/training-words.js — THE TRAINING YARD IN PLAIN WORDS, WITH THE SERVER'S OWN NUMBERS.
//
// PURE. Every sentence is a row of src/data/text/training.js; this fills it from the `training` section
// (src/session/training-sections.js) or a refusal's figures (src/session/training-intents.js). A refusal with no
// number reads from src/data/refusal-words.js; src/shell/intent-words.js refusalText asks here first.
// ════════════════════════════════════════════════════════════════════════
import { t } from '../render/player-text.js?v=0.2.118';
import { whole } from '../render/format.js?v=0.2.118';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.118';
import { TRAINING } from '../data/training.js?v=0.2.118';
import { STOP_REASONS } from '../session/training-sections.js?v=0.2.118';

const num = (v) => Number.isSafeInteger(v);
const MINUTE = 60000;

/** A skill's player name ("Defense"); an id the catalogue doesn't know reads as itself. */
export const skillWord = (id) => (SKILLS_DEF[id] && SKILLS_DEF[id].name) || String(id);
/** A hero's name, or the plain stand-in when the server has not said it yet. */
const nameWord = (name) => (typeof name === 'string' && name ? name : t('training.your_hero'));

/** "3 hours 20 minutes", "1 hour", "45 minutes", "less than a minute": a span, to the minute (rounded up). */
export function timeWords(ms) {
  const m = Math.ceil(Math.max(0, Number(ms) || 0) / MINUTE);
  if (m < 1) return t('training.time_under_minute');
  const h = Math.floor(m / 60), r = m % 60;
  const hours = h ? t('training.time_hours', { count: h }) : '', minutes = r ? t('training.time_minutes', { count: r }) : '';
  return h && r ? t('training.time_both', { hours, minutes }) : hours || minutes;
}

/** "You stopped training Defense.": a town job pressed while the hero trains (town-work.js jobReplacedWords); '' with no words. */
export function leftYardWords(what) {
  return typeof what === 'string' && what ? t('training.left_for_job', { what }) : '';
}

/**
 * A training refusal that carries the server's numbers, in a sentence, or null when it isn't one (the shared table then says it).
 * `r` is training-intents.js's refusal ({ error, verb, level, need, purse, keep, min, max }); `name` the hero's.
 */
export function trainingRefusal(r, name) {
  if (!r || (r.verb !== 'training_start' && r.verb !== 'training_stop')) return null;
  const who = nameWord(name);
  if (r.error === 'level_low' && num(r.need) && num(r.level)) return t('training.level_low', { need: r.need, name: who, level: r.level });
  if (r.error === 'cannot_pay' && num(r.purse) && num(r.keep)) return t('training.cannot_pay', { purse: whole(r.purse), keep: whole(r.keep) });
  /* the server's bounds when it sent them, else the catalogue's (the same rows: src/data/training.js) */
  if (r.error === 'bad_hours') return t('training.bad_hours', { min: num(r.min) ? r.min : TRAINING.stopAfterHours.min, max: num(r.max) ? r.max : TRAINING.stopAfterHours.max });
  if (r.error === 'bad_keep' && num(r.max)) return t('training.keep_max', { max: whole(r.max) });
  if (r.error === 'in_hunt') return t('training.hunting', { name: who });
  if (r.error === 'not_training') return t('training.not_training', { name: who });
  if (r.error === 'settle_first') return t('training.settle_first', { name: who });
  return null;
}

/**
 * Why the last run ended and what it came to: [why, earned] ('' for an earned line with nothing earned). `last` is the
 * section's lastStop; the span a "Stop after" ran is the server's own count of it (last_stop.ms).
 */
export function endedWords(last, name) {
  if (!last || !STOP_REASONS.includes(last.reason)) return ['', ''];
  const who = nameWord(name), skill = skillWord(last.skill);
  const why = t('training.ended_' + last.reason, { name: who, skill, time: timeWords(last.ms) });
  const earned = last.xp > 0 ? t('training.earned', { name: who, xp: whole(last.xp), skill, gold: whole(last.gold) }) : '';
  return [why, earned];
}
