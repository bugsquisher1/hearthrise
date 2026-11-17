// ════════════════════════════════════════════════════════════════════════
// src/shell/hunt-after.js — WHEN THE HUNT ENDS: THE CHOICES, THE PLAN IN WORDS, AND WHAT CAME OF IT.
//
// Tyler 2026-11-15: "an itinerary of sorts where a player picks a hunt and picks what they want to do when the hunt
// finishes." PURE readers of the server's sections for three places:
//   afterChoices(cs)     the hunt page's one control, "When the hunt ends": Wait in town; Go back to the job (only when
//                        the server says there is one, with what a bench still has to make); Train a skill at the yard
//                        (only when the server sends training, with its fee an hour and its longest stay). The picked one
//                        is the server's choice; a hero with no job to go back to reads Wait in town, because that is
//                        what will happen. `note` is the line under the control for the picked one.
//   thenWords(cs)        the running hunt's own plan (frozen at Enter), for the analyzer: "Then: back to working on
//                        Cooked Shrimp, 12 left."
//   afterDoneWords(...)  what came of the ended hunt's choice, for the summary and the away card, or '' when the older
//                        after-hunt words (src/shell/after-hunt.js) already say it.
// Every number is the envelope's (the count a bench has left, the yard's fee, the purse the server found): nothing here is
// computed, spent or sent. The words are src/data/text/away.js.
// ════════════════════════════════════════════════════════════════════════
import { t } from '../render/player-text.js?v=0.2.136';
import { whole } from '../render/format.js?v=0.2.136';
import { huntAfterOf } from '../session/hunt-after-sections.js?v=0.2.136';
import { trainingOf } from '../session/training-sections.js?v=0.2.136';
import { townActivityWords, partyMembershipOf } from '../session/party-sections.js?v=0.2.136';
import { AFTER_INDEX } from '../data/hunt-after.js?v=0.2.136';
import { skillName } from './widgets/bits.js?v=0.2.136';

/* The server's job in words ("working on Cooked Shrimp", "mining the Copper Rock"), or null. */
const doingOf = (job) => (job ? townActivityWords({ active_kind: job.kind, active_id: job.id }) : null);

/** A control value: the choice, and for training its skill ("train:melee"). */
export const afterValue = (choice, skill) => (skill ? choice + ':' + skill : choice);
/** ...and back: { choice, skill } or null for a value the data has no row for. */
export function afterPick(value) {
  const [choice, skill] = String(value || '').split(':');
  const row = AFTER_INDEX[choice];
  if (!row || (row.runs === 'training') !== !!skill) return null;
  return { choice, skill: skill || null };
}

/* The line under a training choice: what it costs and for how long, or why the hero would wait instead. */
function trainNote(tr, skill, party) {
  const q = tr.quotes.find((x) => x.skill === skill);
  if (party) return t('away.train_party');
  if (tr.rate && tr.rate.minLevel !== null && tr.rate.level !== null && tr.rate.level < tr.rate.minLevel) return t('away.train_level', { level: tr.rate.minLevel });
  if (!q || tr.maxHours === null) return '';
  return t('away.train_cost', { fee: whole(q.feeH), hours: tr.maxHours });
}

/**
 * The control's rows, in the data's order, or null when the server has not sent the section.
 * @returns {{ options: {value, label}[], picked: string, note: string }|null}
 */
export function afterChoices(cs) {
  const a = huntAfterOf(cs);
  if (!a) return null;
  const tr = trainingOf(cs);
  const party = !!partyMembershipOf(cs);
  const doing = doingOf(a.job);
  const options = [];
  const notes = {};
  for (const row of Object.values(AFTER_INDEX)) {
    if (row.runs === 'nothing') { options.push({ value: row.id, label: t('away.opt_wait') }); notes[row.id] = t('away.note_wait'); }
    else if (row.runs === 'job') {
      if (!doing) continue;
      options.push({ value: row.id, label: t('away.opt_job', { doing }) });
      notes[row.id] = a.job.left !== null ? t('away.note_job_left', { n: whole(a.job.left) }) : t('away.note_job');
    } else if (row.runs === 'training' && tr && row.place === 'yard') {
      for (const skill of tr.skills) {
        const v = afterValue(row.id, skill);
        options.push({ value: v, label: t('away.opt_train', { skill: skillName(skill) }) });
        notes[v] = trainNote(tr, skill, party);
      }
    }
  }
  /* The server's choice; one the page cannot offer (no job to go back to, training not sent) reads as waiting in town. */
  const want = afterValue(a.choice, a.skill);
  const wait = options.find((o) => AFTER_INDEX[o.value] && AFTER_INDEX[o.value].runs === 'nothing');
  const picked = options.some((o) => o.value === want) ? want : (wait ? wait.value : '');
  const fell = picked !== want && AFTER_INDEX[a.choice] && AFTER_INDEX[a.choice].runs === 'job';
  return { options, picked, note: fell ? t('away.note_no_job') : notes[picked] || '' };
}

/* A plan as a label ("Then: wait in town"), from a choice, its skill and the job it would go back to. A hunt and a training session read
   the same: the label names no session, so a yard session never says "hunt" (lane/a-training-leftovers). */
function planWords(choice, skill, job) {
  const row = AFTER_INDEX[choice];
  const doing = doingOf(job);
  if (row && row.runs === 'training' && skill) return t('away.then_train', { skill: skillName(skill) });
  if (row && row.runs === 'job' && doing) return job.left !== null ? t('away.then_job_left', { doing, n: whole(job.left) }) : t('away.then_job', { doing });
  return t('away.then_wait');
}

/** The running session's own plan, or '' when none runs or the server has not said. Pure. */
export function thenWords(cs) {
  const a = huntAfterOf(cs);
  if (!a || !a.now) return '';
  return planWords(a.now.choice, a.now.skill, a.job);
}

/**
 * What came of the ended hunt `id`'s choice, in a sentence, or '' (not this hunt, nothing came of it yet, or the hero went
 * back to its job: after-hunt.js says that from the pointer). Pure.
 */
export function afterDoneWords(cs, id, name) {
  const a = huntAfterOf(cs);
  const d = a && a.last && a.last.session === id ? a.last.done : null;
  if (!d || d.state === 'resumed') return '';
  const skill = d.skill ? skillName(d.skill) : '';
  if (d.state === 'pending') return t('away.done_pending', { name, skill });
  if (d.state === 'started') return t('away.done_started', { name, skill });
  if (d.why === 'chose_wait') return t('away.done_chose_wait', { name });
  if (d.why === 'insufficient_gold' && d.fee !== null) return t(d.purse !== null ? 'away.done_gold_purse' : 'away.done_gold', { name, fee: whole(d.fee), purse: d.purse !== null ? whole(d.purse) : '' });
  if (d.why === 'low_level' && d.need !== null) return t('away.done_level', { name, level: d.need });
  if (d.why === 'in_party') return t('away.done_party', { name });
  if (d.skill && d.why !== 'moved_on') return t('away.done_no_train', { name, skill });
  return '';
}
