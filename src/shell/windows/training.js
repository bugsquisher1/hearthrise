// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/training.js — THE TRAINING YARD: PICK A SKILL, HOW LONG, WHAT GOLD TO KEEP, AND GO.
//
// The designer's board section "2026-11-10 Combat training"; the server half is 2027-04-06-training-yard.sql. A hero not
// hunting trains Melee, Ranged, Magic or Defense for gold by the hour and earns skill XP only. The yard's dummies in Havora
// and the icon row open it, only while the server sends the `training` section (its switch: src/data/shell-windows.js
// `section`); a section that goes away closes it.
//
// Every number is the server's (CLAUDE.md §1, §6): the rates at the hero's Level, the remembered settings, what the run has
// earned and spent so far (settled about once a minute by the viewed hero's tick, src/session/training-intents.js
// watchTraining, and by the server's own sweep with the page closed), and why the last run ended. The window names only a
// skill, whole hours (or until stopped) and the gold to KEEP, and the server prices it. The one thing drawn between answers
// is the time left, the server's stop_at against the server's clock as the session measures it. Start is off, and says why
// above it, for what the screen already knows (out hunting, under the yard's Level, keeping more gold than there is); the
// server still judges and every refusal reads in plain words (src/shell/training-words.js, src/data/refusal-words.js).
// ════════════════════════════════════════════════════════════════════════
import { trainingOf, trainingNow, runLeftMs } from '../../session/training-sections.js?v=0.2.118';
import { startTraining, stopTraining, keepOk } from '../../session/training-intents.js?v=0.2.118';
import { goldOf, nameOf, skillsOf } from '../../session/item-sections.js?v=0.2.118';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.118';
import { TRAINING } from '../../data/training.js?v=0.2.118';
import { text, cls, attr, prop, rows } from '../../render/paint.js?v=0.2.118';
import { whole } from '../../render/format.js?v=0.2.118';
import { t } from '../../render/player-text.js?v=0.2.118';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.118';
import { runIntent } from '../intent-words.js?v=0.2.118';
import { skillWord, timeWords, endedWords } from '../training-words.js?v=0.2.118';

/* The "How long" picks, in hours, inside the server's bounds; "until I stop it" is the last. */
const HOUR_PICKS = Object.freeze([1, 2, 4, 8, 12, 24]);
const DEFAULT_HOURS = 4;
const SCRATCH = new WeakMap();
/* Display scratch per CharacterSession: the picks before Start (null: the server's remembered settings), the typed keep, the press. */
const scratchOf = (cs) => {
  let s = SCRATCH.get(cs);
  if (!s) { s = { skill: null, hours: undefined, keep: null, pending: false, msg: '' }; SCRATCH.set(cs, s); }
  return s;
};

/* The skills the server offers that this client knows, in the catalogue's order (Melee, Ranged, Magic, Defense). */
const offered = (tr) => TRAINING.skills.filter((k) => tr.skills.includes(k));

/** The skill on the picker: the one picked here, else the server's remembered one, else the first the server trains. Pure. */
export function skillPicked(sc, tr) {
  const list = offered(tr);
  if (sc.skill && list.includes(sc.skill)) return sc.skill;
  const kept = tr.settings && tr.settings.skill;
  return kept && list.includes(kept) ? kept : list[0] || null;
}

/** The hours picked: here, else remembered (null: until stopped), else DEFAULT_HOURS inside the server's bounds. Pure. */
export function hoursPicked(sc, tr) {
  if (sc.hours !== undefined) return sc.hours;
  if (tr.settings) return tr.settings.hours;
  const { min, max } = tr.hours;
  return Math.min(max ?? DEFAULT_HOURS, Math.max(min ?? 1, DEFAULT_HOURS));
}

/** The picks the server's bounds allow, with a remembered value outside the usual list kept. Pure. */
function hourChoices(tr, picked) {
  const min = tr.hours.min ?? TRAINING.stopAfterHours.min, max = tr.hours.max ?? TRAINING.stopAfterHours.max;
  const list = HOUR_PICKS.filter((h) => h >= min && h <= max);
  if (Number.isInteger(picked) && picked >= min && picked <= max && !list.includes(picked)) list.push(picked);
  return list.sort((a, b) => a - b).concat([null]);
}

/** The typed "Keep at least" as gold, or null when it isn't a whole number. Pure. */
export function keepTyped(textValue) {
  const s = String(textValue ?? '').replace(/[,\s]/g, '');
  if (!/^\d{1,13}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Why Start is off now, said above it, or '' when the server is to judge. Only what the screen already knows from the
 * server's own record: out hunting, under the yard's Level, no skill on offer, a typed keep that isn't a number or is more than the purse.
 */
export function startBlock(cs, tr, keep, skill) {
  const name = nameOf(cs) || t('training.your_hero');
  const h = huntOf(cs);
  if (h && !h.ended) return t('training.hunting', { name });
  if (!tr.open) return t('training.level_low', { need: tr.minLevel, name, level: tr.level });
  /* the server offers no skill this client trains: nothing to start */
  if (!skill) return t('training.closed');
  if (keep === null) return t('training.keep_typed');
  if (tr.keepMax !== null && keep > tr.keepMax) return t('training.keep_max', { max: whole(tr.keepMax) });
  const purse = goldOf(cs);
  if (purse !== null && purse <= keep) return t('training.keep_over_purse', { purse: whole(purse) });
  return '';
}

const serverNow = (cs) => { const v = typeof cs.serverNow === 'function' ? cs.serverNow() : null; return Number.isFinite(v) ? v : Date.now(); };

/** The skeleton (built once per opening): the picks start again from the server's remembered settings. */
export function renderTraining(ctx) {
  if (ctx && ctx.character) { const sc = scratchOf(ctx.character); sc.skill = null; sc.hours = undefined; sc.keep = null; sc.msg = ''; }
  return '<div class="tw-train">'
    + '<p class="hs-note tw-lead">' + esc(t('training.lead')) + '</p>'
    + '<p class="tw-rate"></p><p class="hw-cap tw-purse"></p>'
    /* THE RUN, while the server says one runs */
    + '<section class="tw-run" hidden><p class="tw-now"></p><p class="tw-line tw-so-far"></p><p class="tw-line tw-left"></p><p class="tw-line tw-keep-line"></p></section>'
    /* WHY THE LAST ONE ENDED */
    + '<section class="tw-ended" hidden><p class="tw-line tw-why-ended"></p><p class="tw-line tw-earned"></p></section>'
    /* THE THREE CHOICES, while nothing runs */
    + '<div class="tw-form">'
    + '<h3 class="hs-sub">' + esc(t('training.skill_head')) + '</h3>'
    + '<div class="tw-skills" role="radiogroup" aria-label="' + esc(t('training.skill_head')) + '"></div>'
    + '<h3 class="hs-sub">' + esc(t('training.hours_head')) + '</h3>'
    + '<div class="tw-hours" role="radiogroup" aria-label="' + esc(t('training.hours_head')) + '"></div>'
    + '<h3 class="hs-sub">' + esc(t('training.keep_head')) + '</h3>'
    + '<input type="text" inputmode="numeric" autocomplete="off" class="hh-num tw-keep" data-hs-act="keep" maxlength="16" aria-label="' + esc(t('training.keep_head')) + '">'
    + '<p class="hs-note tw-keep-note">' + esc(t('training.keep_note')) + '</p>'
    + '</div>'
    /* THE FOOT: why Start is off, the press and its answer, stuck to the window's foot, so a short window scrolls the choices
       under them and never hides the press (the Havora window's foot) */
    + '<div class="tw-foot"><p class="hw-why tw-off-why"></p>'
    + '<button type="button" class="hh-tool is-primary tw-go" data-hs-act="train-start">' + esc(t('training.press_start')) + '</button>'
    + '<button type="button" class="hh-tool tw-stop" data-hs-act="train-stop" hidden>' + esc(t('training.press_stop')) + '</button>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div></div>';
}

/* The four skills as radio buttons: the name and the server's level, the picked one gold. */
function patchSkills(host, cs, tr, picked) {
  const levels = skillsOf(cs) || {};
  const list = offered(tr);
  rows(host, list.map((k) => ({ k, level: levels[k] ? levels[k].level : null })), {
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

function patchHours(host, tr, picked) {
  rows(host, hourChoices(tr, picked).map((h) => ({ h })), {
    key: (r) => (r.h === null ? 'none' : 'h' + r.h),
    build: () => { const b = host.ownerDocument.createElement('button'); b.type = 'button'; b.className = 'tw-hour'; b.setAttribute('role', 'radio');
      b.setAttribute('data-hs-act', 'hours'); return b; },
    patch: (b, r) => {
      attr(b, 'data-hours', r.h === null ? 'none' : String(r.h));
      attr(b, 'aria-checked', String(r.h === picked));
      text(b, r.h === null ? t('training.hours_none') : t('training.time_hours', { count: r.h }));
    },
  });
}

renderTraining.patch = function patchTraining(body, ctx) {
  const cs = ctx.character;
  const root = body.querySelector('.tw-train');
  if (!cs || !root) return;
  const tr = trainingOf(cs);
  /* THE SWITCH OFF (or the section gone): nothing of the yard stays on screen */
  if (!tr) { if (ctx.wm && typeof ctx.wm.close === 'function') ctx.wm.close('training'); return; }
  const sc = scratchOf(cs);
  const name = nameOf(cs) || t('training.your_hero');
  const purse = goldOf(cs);
  text(root.querySelector('.tw-rate'), t('training.rate', { level: tr.level, xp: whole(tr.xpH), gold: whole(tr.goldH) }));
  text(root.querySelector('.tw-purse'), purse === null ? '' : t('training.purse', { gold: whole(purse) }));

  /* THE RUN: the server's, settled about once a minute; the time left runs on the server's clock between answers */
  const run = tr.run && trainingNow(cs) ? tr.run : null;
  const runBox = root.querySelector('.tw-run');
  prop(runBox, 'hidden', !run);
  if (run) {
    const skill = skillWord(run.skill);
    text(root.querySelector('.tw-now'), t('training.run_now', { name, skill }));
    /* nothing to say before the server's first settle (a minute in) */
    text(root.querySelector('.tw-so-far'), run.xp || run.gold ? t('training.run_so_far', { name, xp: whole(run.xp), gold: whole(run.gold) }) : '');
    const left = runLeftMs(run, serverNow(cs));
    text(root.querySelector('.tw-left'), left === null ? t('training.run_until') : t('training.run_left', { time: timeWords(left) }));
    text(root.querySelector('.tw-keep-line'), run.keep > 0 ? t('training.run_keep', { keep: whole(run.keep) }) : t('training.run_keep_none'));
  }
  /* WHY THE LAST ONE ENDED: the server's reason and its own count of what it came to */
  const [why, earned] = run ? ['', ''] : endedWords(tr.lastStop, nameOf(cs));
  prop(root.querySelector('.tw-ended'), 'hidden', !why);
  text(root.querySelector('.tw-why-ended'), why);
  text(root.querySelector('.tw-earned'), earned);

  /* THE CHOICES */
  const form = root.querySelector('.tw-form');
  prop(form, 'hidden', !!run);
  const skill = skillPicked(sc, tr), hours = hoursPicked(sc, tr);
  patchSkills(root.querySelector('.tw-skills'), cs, tr, skill);
  patchHours(root.querySelector('.tw-hours'), tr, hours);
  const input = root.querySelector('.tw-keep');
  if (sc.keep === null) sc.keep = String(tr.settings ? tr.settings.keep : 0);
  if (input && input.value !== sc.keep && input.ownerDocument.activeElement !== input) input.value = sc.keep;
  for (const b of root.querySelectorAll('.tw-skill, .tw-hour')) prop(b, 'disabled', sc.pending);
  prop(input, 'disabled', sc.pending);

  /* THE PRESS: Start while nothing runs (off, with why, for what the screen already knows), Stop while one does */
  const block = run ? '' : startBlock(cs, tr, keepTyped(sc.keep), skill);
  const go = root.querySelector('.tw-go'), stop = root.querySelector('.tw-stop');
  prop(go, 'hidden', !!run);
  prop(stop, 'hidden', !run);
  prop(go, 'disabled', sc.pending || !!block);
  prop(stop, 'disabled', sc.pending);
  attr(go, 'data-off-why', block || null);
  text(root.querySelector('.tw-off-why'), block);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

/* The typed keep is read as it changes, so a repaint never undoes the typing. */
renderTraining.events = Object.freeze(['input']);

renderTraining.act = function actTraining(ctx, body, action, ev, el) {
  const cs = ctx.character;
  if (!cs) return false;
  const sc = scratchOf(cs);
  const repaint = () => ctx.refresh('training');
  if (ev.type === 'input') {
    if (action !== 'keep') return false;
    sc.keep = el.value;
    repaint();
    return false;
  }
  if (ev.type !== 'click') return false;
  const tr = trainingOf(cs);
  if (!tr) return false;
  if (action === 'skill') { const k = el.getAttribute('data-skill'); if (offered(tr).includes(k)) { sc.skill = k; sc.msg = ''; repaint(); } return true; }
  if (action === 'hours') {
    const v = el.getAttribute('data-hours');
    sc.hours = v === 'none' ? null : Number(v);
    sc.msg = '';
    repaint();
    return true;
  }
  if (sc.pending || !ctx.account) return false;
  if (action === 'train-start') {
    const skill = skillPicked(sc, tr), hours = hoursPicked(sc, tr), keep = keepTyped(sc.keep);
    if (startBlock(cs, tr, keep, skill) || !keepOk(keep)) { repaint(); return true; }
    runIntent(sc, repaint, () => startTraining(ctx.account, cs, { skill, hours, keep }), t('training.busy_start'),
      () => t('training.started', { name: nameOf(cs) || t('training.your_hero') }), cs);
    return true;
  }
  if (action === 'train-stop') {
    /* the answer's words are the section's own: why it ended and what it came to (patch above) */
    runIntent(sc, repaint, () => stopTraining(ctx.account, cs), t('training.busy_stop'), () => '', cs);
    return true;
  }
  return false;
};
