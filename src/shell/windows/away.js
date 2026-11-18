// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/away.js — "WHILE YOU WERE AWAY": ONE CARD FOR THE RETURN.
//
// UI audit 2026-11-18 #2: the idle game's big moment was a seven-line paragraph at the World's left edge ("Away 8 h 0 min:
// Marlow hunted Mill Cellar: Level 8 to 9, +59,989 Level XP, ...") beside a hunt summary that opened on chores and hid its
// numbers. Now the return is ONE card, docked where the summary docks: how long the player was away, then each hero that did
// something, on the end card's result block (../result-block.js): the Level line, Level XP, Gold and Kills, the best find,
// why the hunt ended and when ("Ended 6 days ago"), and the one next press (Hunt again). The summary of a hunt this card tells
// is not opened beside it; the card's Hunt summary opens it.
//
// THE LINES ARE THE ALERT CENTRE'S (../alerts.js, kind `away`): each one two server answers (../away-recap.js, ../away-work.js),
// raised once per absence, kept up to date by each envelope (awayNowOf: still hunting or ended, the stamina now). The alert
// lines widget leaves them to this card. Closing the card is reading them: every away line is dismissed. Nothing here
// counts or predicts a number; Hunt again is the server's own restart (CharacterSession.restartHunt), checked there.
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, prop, attr, element } from '../../render/paint.js?v=0.2.137';
import { whole, gold } from '../../render/format.js?v=0.2.137';
import { t } from '../../render/player-text.js?v=0.2.137';
import { itemName, itemIconHtml } from '../widgets/bits.js?v=0.2.137';
import { resultHtml, patchResult } from '../result-block.js?v=0.2.137';
import { awayNowOf } from '../away-recap.js?v=0.2.137';
import { spanWords } from '../after-hunt.js?v=0.2.137';
import { refusalWords, playCapOf } from '../intent-words.js?v=0.2.137';
import { summariesOf } from '../../hunt-view/summary-recorder.js?v=0.2.137';
import { roomOfHunt } from '../../data/boss-halls.js?v=0.2.137';
import { trainingOf as trainedBy } from '../../data/training.js?v=0.2.137';
import { TOWER_RULES } from '../../data/tower.js?v=0.2.137';

/* The away lines the centre holds now, oldest hero slot first. */
const linesOf = (ctx) => (ctx.alerts ? ctx.alerts.list().filter((a) => a.kind === 'away') : []).sort((a, b) => a.slot - b.slot);
const heroOf = (ctx, a) => ctx.peers().find((p) => p.slot === a.slot) || null;
/* A hunt the server can start again with its own settings: never a boss room (its one door is a paid press), a training session (its
   Start is the Training window's) or a climb (the Tower window's). */
const restartable = (hunt) => !!hunt && !roomOfHunt(hunt) && !trainedBy(hunt) && hunt !== TOWER_RULES.hunt;
const OPENS = Object.freeze({ bag: 'inventory', show: null });

/**
 * One hero's block as it reads now: the result (a hunt's, two server answers), the best find, the line under it, and its press.
 * `go`: 'again' (the server's restart), 'train' (the Training window), 'summary' (that hero's Hunt summary) or 'show' / 'bag' (that hero).
 */
export function awayBlockOf(cs, a) {
  const f = a.facts || {};
  const now = cs && !a.work ? awayNowOf(cs, a) : null;
  const hunt = !a.work && !(now && now.training);
  const result = hunt ? {
    level: Number.isSafeInteger(f.lvTo) ? { name: t('summary.lv_name'), from: f.lvFrom, to: f.lvTo } : null, ups: [],
    figs: [f.xp > 0 ? { key: 'xp', label: t('summary.fig_xp'), value: '+' + whole(f.xp) } : null,
      f.gold > 0 ? { key: 'gold', label: t('summary.fig_gold'), value: '+' + gold(f.gold) } : null,
      f.kills > 0 ? { key: 'kills', label: t('summary.fig_kills'), value: whole(f.kills) } : null].filter(Boolean),
  } : { level: null, ups: [], figs: [] };
  let why = '', when = '', stamina = '', go = a.action === 'bag' ? 'bag' : 'show', label = a.button;
  if (a.work) why = f.body || a.text;
  else if (now && now.training) {
    why = now.ended ? now.why : t('training.away_still');
    if (now.ended) { when = [now.ago ? t('away.card_ended_when', { time: now.ago }) : '', now.next].filter(Boolean).join(' '); go = 'train'; label = t('training.card_again'); }
  } else if (now && now.ended) {
    why = now.why;
    when = [now.ago ? t('away.card_ended_when', { time: now.ago }) : '', now.next].filter(Boolean).join(' ');
    stamina = now.stamina ? t('away.card_stamina', { time: now.stamina }) : '';
    if (restartable(f.hunt) && a.session) { go = 'again'; label = t('controls.hunt_again'); } else { go = 'summary'; label = t('away.card_summary'); }
  } else if (now) why = now.stamina ? t('away.card_still_stamina', { time: now.stamina }) : t('away.card_still');
  return { name: f.name || '', place: a.work ? '' : f.place || '', result, best: hunt && f.best ? f.best : null, why, when, stamina, go, label,
    /* the card's foot offers the viewed hero's Hunt summary once its hunt has ended (the loot, the trip home) */
    summary: go === 'again' };
}

/** The skeleton (built once): how long the player was away, the heroes, OK. */
export function renderAway() {
  return '<div class="haway"><p class="haway-gone"></p><ol class="haway-heroes"></ol>'
    + '<div class="hsum-actions haway-foot"><button type="button" class="hh-tool" data-hs-act="away-summary" hidden>' + t('away.card_summary') + '</button>'
    + '<button type="button" class="hh-tool" data-hs-act="away-ok">' + t('away.card_ok') + '</button></div></div>';
}

function heroRow(ctx) {
  return element(ctx.doc, '<li class="haway-hero"><header class="haway-head"><h3 class="haway-name"></h3><span class="haway-place"></span></header>'
    + resultHtml()
    + '<p class="haway-best"><span class="hsum-ico"></span><span class="haway-best-name"><small>' + t('away.card_best') + '</small><b></b></span></p>'
    + '<p class="haway-why"></p><p class="haway-when"></p>'
    + '<div class="haway-acts"><button type="button" class="hh-tool" data-hs-act="away-go"></button><span class="haway-stamina"></span></div><p class="hh-intent-msg haway-msg" role="status" aria-live="polite"></p></li>');
}

renderAway.patch = function patchAway(body, ctx) {
  const root = body.querySelector('.haway');
  const list = linesOf(ctx);
  const longest = list.reduce((m, a) => Math.max(m, a.facts && Number.isFinite(a.facts.gone) ? a.facts.gone : 0), 0);
  text(root.querySelector('.haway-gone'), longest > 0 ? t('away.card_gone', { time: spanWords(longest) }) : '');
  const mine = ctx.character ? list.find((a) => a.slot === ctx.character.slot && awayBlockOf(ctx.character, a).summary) : null;
  const sum = root.querySelector('[data-hs-act="away-summary"]');
  prop(sum, 'hidden', !mine);
  attr(sum, 'data-alert', mine ? mine.key : null);
  rows(root.querySelector('.haway-heroes'), list, {
    key: (a) => a.key,
    build: (a) => { const li = heroRow(ctx); for (const b of li.querySelectorAll('button')) b.setAttribute('data-alert', a.key); return li; },
    patch: (li, a) => {
      const b = awayBlockOf(heroOf(ctx, a), a);
      text(li.querySelector('.haway-name'), b.name);
      text(li.querySelector('.haway-place'), b.place);
      patchResult(li.querySelector('.hres'), b.result);
      cls(li.querySelector('.hres'), 'is-empty', !b.result.level && !b.result.figs.length);
      const best = li.querySelector('.haway-best');
      prop(best, 'hidden', !b.best);
      const ico = best.querySelector('.hsum-ico');
      if (ico.getAttribute('data-ico') !== (b.best || '')) { ico.setAttribute('data-ico', b.best || ''); ico.innerHTML = b.best ? itemIconHtml(ctx.glyphs, b.best) : ''; }
      text(best.querySelector('b'), b.best ? itemName(b.best) : '');
      text(li.querySelector('.haway-why'), b.why);
      text(li.querySelector('.haway-when'), b.when);
      text(li.querySelector('.haway-stamina'), b.stamina);
      const go = li.querySelector('[data-hs-act="away-go"]');
      text(go, a.pending ? t('heroes.sending') : b.label);
      attr(go, 'data-go', b.go);
      prop(go, 'disabled', !!a.pending);
      /* ONE gold press on the card: the first hero's next move */
      cls(go, 'is-primary', list.indexOf(a) === 0);
      text(li.querySelector('.haway-msg'), a.msg || '');
    },
  });
};

/* Every away line is read: the card closing (OK, the close, Esc) or a press that leaves it. */
function dismissAll(ctx) { for (const a of linesOf(ctx)) ctx.alerts.dismiss(a.key); }

renderAway.act = function actAway(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  if (action === 'away-ok') { ctx.wm.close('away'); return true; }
  if (action !== 'away-go' && action !== 'away-summary') return false;
  const a = linesOf(ctx).find((x) => x.key === el.getAttribute('data-alert'));
  if (!a || a.pending) return true;
  const go = action === 'away-summary' ? 'summary' : el.getAttribute('data-go');
  if (go === 'again') { restart(ctx, body, a); return true; }
  const win = go === 'train' ? 'training' : go === 'summary' ? 'hunt-summary' : OPENS[go] || null;
  ctx.wm.close('away');
  if (ctx.goTo) ctx.goTo(a.slot, win);
  return true;
};

/* Hunt again: that hero's ONE restart intent; the press goes off until the server answers. The line goes once the new hunt is the hero's
   (awayLineNow: another session), and the card with it once no line is left. A refusal is said on the hero's own line. */
async function restart(ctx, body, a) {
  const cs = heroOf(ctx, a);
  if (!cs) return;
  ctx.alerts.mark(a.key, true, '');
  renderAway.patch(body, ctx);
  let r;
  try { r = await cs.restartHunt(a.session); } catch (e) { r = { ok: false, error: 'network' }; }
  if (r && r.ok) { ctx.alerts.dismiss(a.key); if (!linesOf(ctx).length) ctx.wm.close('away'); }
  else ctx.alerts.mark(a.key, false, playCapOf(r) ? '' : refusalWords(r && r.error));
  if (ctx.wm.isOpen('away')) renderAway.patch(body, ctx);
}

/**
 * The shell's mount: open the card when the centre raises an away line it has not shown, and keep it to its lines. The summary of the
 * viewed hero's hunt this card tells is not opened beside it (the card is the return's one notice), and a death's popup goes first.
 * Returns the unsubscribe.
 */
renderAway.follow = function followAway(ctx, refresh) {
  const centre = ctx.alerts;
  if (!centre || typeof centre.subscribe !== 'function') return () => {};
  const shown = new Set();
  let open = false, busy = false;
  const step = () => {
    const up = ctx.wm.isOpen('away');
    if (open && !up) dismissAll(ctx);
    open = up;
    const list = linesOf(ctx);
    if (!up && list.some((a) => !shown.has(a.key)) && !ctx.wm.isOpen('death')) { for (const a of list) shown.add(a.key); open = true; ctx.wm.open('away'); }
    if (!open) return;
    if (!list.length) { ctx.wm.close('away'); return; }
    const cs = ctx.character, top = cs ? summariesOf(cs)[0] : null;
    if (ctx.wm.isOpen('hunt-summary') && top && list.some((a) => a.slot === cs.slot && a.session === top.id)) ctx.wm.close('hunt-summary');
    refresh('away');
  };
  /* the window manager and the centre both call back while a step opens or closes: one step at a time, then once more for what it moved */
  let again = false;
  const sync = () => {
    if (busy) { again = true; return; }
    busy = true;
    try { for (let n = 0; n < 4; n++) { again = false; step(); if (!again) break; } } finally { busy = false; }
  };
  const offAlerts = centre.subscribe(sync), offWm = ctx.wm.subscribe(sync);
  sync();
  return () => { offAlerts(); offWm(); };
};
