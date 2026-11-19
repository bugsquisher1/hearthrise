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
import { rows, text, cls, prop, attr, element } from '../../render/paint.js?v=0.2.141';
import { whole, gold } from '../../render/format.js?v=0.2.141';
import { t } from '../../render/player-text.js?v=0.2.141';
import { itemName, itemIconHtml, skillName } from '../widgets/bits.js?v=0.2.141';
import { resultHtml, patchResult, goldFig } from '../result-block.js?v=0.2.141';
import { awayNowOf } from '../away-recap.js?v=0.2.141';
import { deathWords, blessingsMissing } from '../death-popup.js?v=0.2.141';
import { deathLogOf } from '../../session/character-sections.js?v=0.2.141';
import { spanWords } from '../after-hunt.js?v=0.2.141';
import { refusalWords, playCapOf } from '../intent-words.js?v=0.2.141';
import { summariesOf } from '../../hunt-view/summary-recorder.js?v=0.2.141';
import { roomOfHunt } from '../../data/boss-halls.js?v=0.2.141';
import { trainingOf as trainedBy } from '../../data/training.js?v=0.2.141';
import { runRulesOf } from '../../data/tower.js?v=0.2.141';

/* The away lines the centre holds now, oldest hero slot first. */
const linesOf = (ctx) => (ctx.alerts ? ctx.alerts.list().filter((a) => a.kind === 'away') : []).sort((a, b) => a.slot - b.slot);
const heroOf = (ctx, a) => ctx.peers().find((p) => p.slot === a.slot) || null;
/* A hunt the server can start again with its own settings: never a boss room (its one door is a paid press), a training session (its
   Start is the Training window's) or a run (a climb or a descent: the Tower window's). */
const restartable = (hunt) => !!hunt && !roomOfHunt(hunt) && !trainedBy(hunt) && !runRulesOf(hunt);
const OPENS = Object.freeze({ bag: 'inventory', show: null });
/* THE GOLD THE PURSE KEPT (audit 2026-11-18 A6: "+6,182 gold" while the purse rose 1,843): the coins less the store's supplies, the end card's
   own reading (../result-block.js goldFig); none when the line has no store spend to set against the coins (../away-recap.js says no gold then).
   A yard that took over from the hunt billed the same purse: `yard`, out of the Gold and said under it (post-140 audit C3). */
const awayGoldFig = (f) => goldFig(Number.isFinite(f.gold) && Number.isFinite(f.looted) && Number.isFinite(f.paid)
  ? { net: f.gold, coins: f.looted, spent: f.paid, yard: Number.isFinite(f.yard) ? f.yard : null } : null, null);

/**
 * One hero's block as it reads now: the result (a hunt's, two server answers), the best find, the line under it, and its press.
 * `go`: 'again' (the server's restart), 'train' (the Training window), 'summary' (that hero's Hunt summary) or 'show' / 'bag' (that hero).
 */
export function awayBlockOf(cs, a) {
  const f = a.facts || {};
  const now = cs && !a.work ? awayNowOf(cs, a) : null;
  /* a hunt's result, also when the yard took over from it (the line keeps that hunt: ../away-recap.js); a training session's is its skill */
  const hunt = !a.work && (f.tookOver === true || !(now && now.training));
  const tr = !a.work && f.train ? f.train : null;
  const result = hunt ? {
    level: Number.isSafeInteger(f.lvTo) ? { name: t('summary.lv_name'), from: f.lvFrom, to: f.lvTo } : null,
    /* the skill the yard that took over trained, "Melee 28 to 34" (two server answers) */
    ups: tr && tr.to > tr.from ? [t('summary.skill_up', { skill: skillName(tr.skill), from: tr.from, to: tr.to })] : [],
    figs: [f.xp > 0 ? { key: 'xp', label: t('summary.fig_xp'), value: '+' + whole(f.xp) } : null,
      awayGoldFig(f),
      f.kills > 0 ? { key: 'kills', label: t('summary.fig_kills'), value: whole(f.kills) } : null].filter(Boolean),
  /* A YARD'S CARD HAS ITS NUMBERS (audit 2026-11-18 A22): the skill's levels and XP over the absence, the server's */
  } : tr ? { level: { name: skillName(tr.skill), from: tr.from, to: tr.to }, ups: [],
    figs: [{ key: 'xp', label: t('training.card_xp', { skill: skillName(tr.skill) }), value: '+' + whole(tr.xp) }] } : { level: null, ups: [], figs: [] };
  let why = '', when = '', stamina = '', go = a.action === 'bag' ? 'bag' : 'show', label = a.button;
  if (a.work) why = f.body || a.text;
  else if (now && now.training) {
    const yard = now.ended ? now.why : t('training.away_still');
    /* the yard took over: the hunt's end the server knows (a death) first, then the yard and where it stands */
    why = f.tookOver ? f.died || '' : yard;
    when = [f.tookOver ? f.after : '', f.tookOver ? yard : '', now.ended && now.ago ? t('away.card_ended_when', { time: now.ago }) : '', now.ended ? now.next : '']
      .filter(Boolean).join(' ');
    /* a training session is no hunt (Tyler 2026-11-16): its door is the Training window, never "See the hunt" */
    go = 'train'; label = now.ended ? t('training.card_again') : t('away.card_training');
  } else if (now && now.ended) {
    why = now.why;
    when = [now.ago ? t('away.card_ended_when', { time: now.ago }) : '', now.next].filter(Boolean).join(' ');
    stamina = now.stamina ? t('away.card_stamina', { time: now.stamina }) : '';
    if (restartable(f.hunt) && a.session) { go = 'again'; label = t('controls.hunt_again'); } else { go = 'summary'; label = t('away.card_summary'); }
  } else if (now) why = now.stamina ? t('away.card_still_stamina', { time: now.stamina }) : t('away.card_still');
  return { name: f.name || '', place: a.work ? '' : f.place || '', result, best: hunt && f.best ? f.best : null, why, when, stamina, go, label,
    /* the card's foot offers the viewed hero's Hunt summary once its hunt has ended (the loot, the trip home) */
    summary: go === 'again', bless: blessOf(cs, f) };
}

/* A DEATH DURING THE ABSENCE OFFERS ITS BLESSINGS BACK (post-patch audit 2026-11-18 B5: "3 Blessings saved 18,220 Level XP, used up" and no way
   back to them; the next hunt ran unblessed). The death popup's own press ("Bless again" once the death used them, ../death-popup.js), while the
   server says the hero lacks one; '' otherwise. The death is the server's row for the session the line names (`deathSession`). */
function blessOf(cs, f) {
  const row = cs && f.deathSession ? (deathLogOf(cs) || []).find((r) => r.session === f.deathSession) : null;
  return row && blessingsMissing(cs) === true ? deathWords(cs, { session: f.deathSession, row }).bless : '';
}

/** The skeleton (built once): how long the player was away, the heroes, OK. */
export function renderAway() {
  return '<div class="haway"><p class="haway-gone"></p><ol class="haway-heroes"></ol>'
    /* THE FIRST HERO'S PRESS IN THE FOOT TOO (v0.2.141 visual gate, 922x423: with a yard session open the sheet stops above the action bar,
       275 px tall, and Open Training lay under the sticky OK): the same press as the hero's row (its alert, its go), shown in the foot on a
       phone only (summary.css), where the row's own one is hidden, so the one gold press is in view as the card opens */
    + '<div class="hsum-actions haway-foot"><button type="button" class="hh-tool is-primary haway-foot-go" data-hs-act="away-go" hidden></button>'
    + '<button type="button" class="hh-tool" data-hs-act="away-summary" hidden>' + t('away.card_summary') + '</button>'
    + '<button type="button" class="hh-tool" data-hs-act="away-ok">' + t('away.card_ok') + '</button></div></div>';
}

function heroRow(ctx) {
  return element(ctx.doc, '<li class="haway-hero"><header class="haway-head"><h3 class="haway-name"></h3><span class="haway-place"></span></header>'
    + resultHtml()
    + '<p class="haway-best"><span class="hsum-ico"></span><span class="haway-best-name"><small>' + t('away.card_best') + '</small><b></b></span></p>'
    + '<p class="haway-why"></p><p class="haway-when"></p>'
    + '<div class="haway-acts"><button type="button" class="hh-tool" data-hs-act="away-go"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="away-bless" hidden></button><span class="haway-stamina"></span></div>'
    + '<p class="hh-intent-msg haway-msg" role="status" aria-live="polite"></p></li>');
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
      const bless = li.querySelector('[data-hs-act="away-bless"]');
      text(bless, b.bless);
      prop(bless, 'hidden', !b.bless);
      text(li.querySelector('.haway-msg'), a.msg || '');
    },
  });
  /* the foot's copy of the first hero's press (shown on a phone only): its words, its go, its alert, off while that ask is out */
  const first = list[0] || null, lead = first ? awayBlockOf(heroOf(ctx, first), first) : null;
  const pending = !!(first && first.pending);   // that hero's ask is out: the press says "Sending…", as the row's does
  const footGo = root.querySelector('.haway-foot-go');
  prop(footGo, 'hidden', !first);
  text(footGo, !first ? '' : pending ? t('heroes.sending') : lead.label);
  attr(footGo, 'data-alert', first ? first.key : null);
  attr(footGo, 'data-go', lead ? lead.go : null);
  prop(footGo, 'disabled', pending);
};

/* Every away line is read: the card closing (OK, the close, Esc) or a press that leaves it. */
function dismissAll(ctx) { for (const a of linesOf(ctx)) ctx.alerts.dismiss(a.key); }

renderAway.act = function actAway(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  if (action === 'away-ok') { ctx.wm.close('away'); return true; }
  if (action !== 'away-go' && action !== 'away-summary' && action !== 'away-bless') return false;
  const a = linesOf(ctx).find((x) => x.key === el.getAttribute('data-alert'));
  if (!a || a.pending) return true;
  /* Bless again: the Shop on its Services tab, the hero on screen's; another hero's is shown first (as the death popup's press does) */
  if (action === 'away-bless') {
    ctx.wm.close('away');
    if (ctx.character && ctx.character.slot === a.slot) ctx.wm.openTab('shop', 'services'); else if (ctx.goTo) ctx.goTo(a.slot, 'shop');
    return true;
  }
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
    if (!up && list.some((a) => !shown.has(a.key)) && !ctx.wm.isOpen('death')) {
      for (const a of list) shown.add(a.key);
      open = true;
      ctx.wm.open('away');
      /* ...over the summary of the same hunt if that opened first (shell.js opens none while the card is up); one the player opens later stays */
      const cs = ctx.character, top = cs ? summariesOf(cs)[0] : null;
      if (ctx.wm.isOpen('hunt-summary') && top && list.some((a) => a.slot === cs.slot && a.session === top.id)) ctx.wm.close('hunt-summary');
    }
    if (!open) return;
    if (!list.length) { ctx.wm.close('away'); return; }
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
