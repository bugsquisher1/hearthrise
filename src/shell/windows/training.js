// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/training.js — THE TRAINING YARD: PICK A COMBAT SKILL, SEE WHAT AN HOUR COSTS, START OR STOP.
//
// The designer's board section "2026-11-13 Combat training spec"; the server half is lane/c-combat-training. A hero in
// town trains one combat skill at the yard (a fee each hour) or on the account's house dummy (no fee, once that skill
// is unlocked in the House). The yard's dummies in Havora open it, only while the server sends the `training` section
// (src/data/shell-windows.js `section`); a section that goes away closes it.
//
// Every number is the server's (CLAUDE.md §1, §6): the fee, the XP an hour and the hours to the next level are the
// section's quotes, read, never worked out. The window names a skill, a place and the fee the player SAW, and the
// server re-quotes it. The one thing drawn between answers is the running clock (since, against the server's clock).
// Start is off, and says why above it, for what the screen already knows; the server still judges, and every refusal
// reads in plain words (src/shell/training-words.js, src/data/refusal-words.js).
// ════════════════════════════════════════════════════════════════════════
import { trainingOf, quoteFor, runForMs } from '../../session/training-sections.js?v=0.2.126';
import { startTraining, stopTraining } from '../../session/training-intents.js?v=0.2.126';
import { goldOf, nameOf, skillsOf } from '../../session/item-sections.js?v=0.2.126';
import { huntOf, partyOf } from '../../session/hunt-sections.js?v=0.2.126';
import { text, cls, attr, prop, rows } from '../../render/paint.js?v=0.2.126';
import { whole } from '../../render/format.js?v=0.2.126';
import { t } from '../../render/player-text.js?v=0.2.126';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.126';
import { runIntent } from '../intent-words.js?v=0.2.126';
import { skillWord, timeWords, endedWords } from '../training-words.js?v=0.2.126';

/* The ground a training session runs on (src/data/hunts.js, the server half): its hunt is the run, not "out hunting". */
const YARD_GROUND = 'training_yard';
const CLOCK_MS = 30000;
const SCRATCH = new WeakMap();
const scratchOf = (cs) => {
  let s = SCRATCH.get(cs);
  if (!s) { s = { skill: null, where: 'yard', pending: false, msg: '', clock: null }; SCRATCH.set(cs, s); }
  return s;
};

/** The skill on the picker: the one picked here, else the first the server trains. Pure. */
export function skillPicked(sc, tr) {
  return sc.skill && tr.skills.includes(sc.skill) ? sc.skill : tr.skills[0] || null;
}

/** Where it trains: the house only while the dummy holds the picked skill. Pure. */
export function wherePicked(sc, tr, skill) {
  const owned = !!(tr.dummy && tr.dummy.owned.includes(skill));
  return sc.where === 'house' && owned ? 'house' : 'yard';
}

/**
 * Why Start is off now, said above it, or '' when the server is to judge. Only what the screen already knows from the
 * server's own record: out hunting, in a party, no quote, a purse under the first hour, a dummy in use.
 */
export function startBlock(cs, tr, skill, where) {
  const name = nameOf(cs) || t('training.your_hero');
  const h = huntOf(cs);
  if (h && !h.ended && h.huntId !== YARD_GROUND) return t('training.hunting', { name });
  if (partyOf(cs)) return t('training.in_party', { name });
  const q = quoteFor(tr, skill);
  if (!skill || !q) return t('training.closed');
  if (where === 'house') {
    if (tr.dummy && tr.dummy.busy) return t('training.dummy_busy', { who: tr.dummy.busy });
    return '';
  }
  const purse = goldOf(cs);
  if (purse !== null && purse < q.feeH) return t('training.short_gold', { fee: whole(q.feeH), purse: whole(purse) });
  return '';
}

const serverNow = (cs) => { const v = typeof cs.serverNow === 'function' ? cs.serverNow() : null; return Number.isFinite(v) ? v : Date.now(); };

/** The skeleton (built once per opening). */
export function renderTraining(ctx) {
  if (ctx && ctx.character) { const sc = scratchOf(ctx.character); sc.skill = null; sc.where = 'yard'; sc.msg = ''; }
  return '<div class="tw-train">'
    + '<p class="hs-note tw-lead">' + esc(t('training.lead')) + '</p>'
    + '<p class="hw-cap tw-purse"></p>'
    + '<section class="tw-run" hidden><p class="tw-now"></p><p class="tw-line tw-run-where"></p><p class="tw-line tw-run-clock"></p><p class="tw-line tw-run-paid"></p></section>'
    + '<p class="tw-line tw-ended" hidden></p>'
    + '<div class="tw-form">'
    + '<h3 class="hs-sub">' + esc(t('training.skill_head')) + '</h3>'
    + '<div class="tw-skills" role="radiogroup" aria-label="' + esc(t('training.skill_head')) + '"></div>'
    + '<dl class="tw-quote"><dt class="tw-fee"></dt><dd class="tw-xp"></dd><dd class="tw-to-level"></dd></dl>'
    + '<div class="tw-where-box" hidden><h3 class="hs-sub">' + esc(t('training.where_head')) + '</h3>'
    + '<div class="tw-where" role="radiogroup" aria-label="' + esc(t('training.where_head')) + '">'
    + '<button type="button" class="tw-place" role="radio" data-hs-act="where" data-where="yard">' + esc(t('training.where_yard')) + '</button>'
    + '<button type="button" class="tw-place" role="radio" data-hs-act="where" data-where="house">' + esc(t('training.where_house')) + '</button>'
    + '</div></div>'
    + '<p class="hs-note tw-terms"></p>'
    + '</div>'
    + '<div class="tw-foot"><p class="hw-why tw-off-why"></p>'
    + '<button type="button" class="hh-tool is-primary tw-go" data-hs-act="train-start">' + esc(t('training.press_start')) + '</button>'
    + '<button type="button" class="hh-tool tw-stop" data-hs-act="train-stop" hidden>' + esc(t('controls.stop')) + '</button>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div></div>';
}

/* The skills as radio buttons: the name and the server's level, the picked one gold. */
function patchSkills(host, cs, tr, picked) {
  const levels = skillsOf(cs) || {};
  rows(host, tr.skills.map((k) => ({ k, level: levels[k] ? levels[k].level : null })), {
    key: (r) => r.k,
    build: () => { const b = host.ownerDocument.createElement('button'); b.type = 'button'; b.className = 'tw-skill'; b.setAttribute('role', 'radio');
      b.setAttribute('data-hs-act', 'skill'); b.innerHTML = '<span class="tw-skill-name"></span><b class="tw-skill-level"></b>'; return b; },
    patch: (b, r) => {
      attr(b, 'data-skill', r.k);
      attr(b, 'aria-checked', String(r.k === picked));
      text(b.querySelector('.tw-skill-name'), skillWord(r.k));
      text(b.querySelector('.tw-skill-level'), r.level === null ? '' : String(r.level));
    },
  });
}

/* A minute clock while the window shows a run: the patch asks itself again; a closed window drops it. */
function armClock(ctx, root, sc, on) {
  if (sc.clock) { clearTimeout(sc.clock); sc.clock = null; }
  if (!on) return;
  sc.clock = setTimeout(() => { sc.clock = null; if (root.isConnected) ctx.refresh('training'); }, CLOCK_MS);
}

renderTraining.patch = function patchTraining(body, ctx) {
  const cs = ctx.character;
  const root = body.querySelector('.tw-train');
  if (!cs || !root) return;
  const tr = trainingOf(cs);
  if (!tr) { if (ctx.wm && typeof ctx.wm.close === 'function') ctx.wm.close('training'); return; }
  const sc = scratchOf(cs);
  const name = nameOf(cs) || t('training.your_hero');
  const purse = goldOf(cs);
  text(root.querySelector('.tw-purse'), purse === null ? '' : t('training.purse', { gold: whole(purse) }));

  /* THE RUN: the server's session; the clock runs on the server's clock between answers */
  const run = tr.run;
  prop(root.querySelector('.tw-run'), 'hidden', !run);
  if (run) {
    text(root.querySelector('.tw-now'), t('training.run_now', { name, skill: skillWord(run.skill) }));
    text(root.querySelector('.tw-run-where'), run.where === 'house' ? t('training.run_where_house') : t('training.run_where_yard', { gold: whole(run.feeH) }));
    text(root.querySelector('.tw-run-clock'), t('training.run_clock', { time: timeWords(runForMs(run, serverNow(cs))) }));
    text(root.querySelector('.tw-run-paid'), run.where === 'yard' ? t('training.run_paid', { gold: whole(run.paid) }) : '');
  }
  armClock(ctx, root, sc, !!run);
  const ended = run ? '' : endedWords(tr.lastStop, nameOf(cs));
  prop(root.querySelector('.tw-ended'), 'hidden', !ended);
  text(root.querySelector('.tw-ended'), ended);

  /* THE CHOICES */
  prop(root.querySelector('.tw-form'), 'hidden', !!run);
  const skill = skillPicked(sc, tr), where = wherePicked(sc, tr, skill);
  patchSkills(root.querySelector('.tw-skills'), cs, tr, skill);
  const q = quoteFor(tr, skill);
  text(root.querySelector('.tw-fee'), !q ? '' : where === 'house' ? t('training.fee_house') : t('training.fee', { gold: whole(q.feeH) }));
  text(root.querySelector('.tw-xp'), q && q.xpH !== null ? t('training.xp', { xp: whole(q.xpH), skill: skillWord(skill) }) : '');
  text(root.querySelector('.tw-to-level'), q && q.hoursToNext !== null && q.level !== null
    ? t('training.to_level', { hours: t('training.time_hours', { count: Math.max(1, q.hoursToNext) }), skill: skillWord(skill), level: q.level + 1 }) : '');
  const owned = !!(tr.dummy && tr.dummy.owned.includes(skill));
  prop(root.querySelector('.tw-where-box'), 'hidden', !owned);
  for (const b of root.querySelectorAll('.tw-place')) attr(b, 'aria-checked', String(b.getAttribute('data-where') === where));
  text(root.querySelector('.tw-terms'), where === 'house' ? (tr.maxHours ? t('training.max_hours', { hours: tr.maxHours }) : '')
    : t('training.paid_ahead') + (tr.maxHours ? ' ' + t('training.max_hours', { hours: tr.maxHours }) : ''));
  for (const b of root.querySelectorAll('.tw-skill, .tw-place')) prop(b, 'disabled', sc.pending);

  /* THE PRESS: Start while nothing runs (off, with why), Stop while one does */
  const block = run ? '' : startBlock(cs, tr, skill, where);
  const go = root.querySelector('.tw-go'), stop = root.querySelector('.tw-stop');
  prop(go, 'hidden', !!run);
  prop(stop, 'hidden', !run);
  prop(go, 'disabled', sc.pending || !!block);
  prop(stop, 'disabled', sc.pending);
  attr(go, 'data-off-why', block || null);
  text(root.querySelector('.tw-off-why'), block);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

renderTraining.act = function actTraining(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  if (!cs) return false;
  const sc = scratchOf(cs);
  const repaint = () => ctx.refresh('training');
  const tr = trainingOf(cs);
  if (!tr) return false;
  if (action === 'skill') { const k = el.getAttribute('data-skill'); if (tr.skills.includes(k)) { sc.skill = k; sc.msg = ''; repaint(); } return true; }
  if (action === 'where') { sc.where = el.getAttribute('data-where') === 'house' ? 'house' : 'yard'; sc.msg = ''; repaint(); return true; }
  if (sc.pending || !ctx.account) return false;
  if (action === 'train-start') {
    const skill = skillPicked(sc, tr), where = wherePicked(sc, tr, skill), q = quoteFor(tr, skill);
    if (startBlock(cs, tr, skill, where) || !q) { repaint(); return true; }
    runIntent(sc, repaint, () => startTraining(ctx.account, cs, { skill, where, feeSeen: where === 'house' ? 0 : q.feeH }), t('training.busy_start'),
      () => t('training.started', { name: nameOf(cs) || t('training.your_hero'), skill: skillWord(skill) }), cs);
    return true;
  }
  if (action === 'train-stop') {
    runIntent(sc, repaint, () => stopTraining(cs), t('training.busy_stop'), () => '', cs);
    return true;
  }
  return false;
};
