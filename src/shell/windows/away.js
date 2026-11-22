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
// CARRY ON (Tyler RULED 27-1, 2026-11-20; ../carry-on.js): above the heroes, ONE press for the whole account and the server's plan for
// each hero; while it is on offer it is the card's one gold press, and each hero's own press stays the way to send just that hero.
// NEEDS YOU (designer D-2 section 2.3, lane/c-company; ../needs-you.js): between how long the player was away and Carry on, at most three
// rows that need a decision, ranked, one a kind for the account; each press opens the window that decides it. The company's plan lines
// ("Wear upgrades", "If one falls") sit in the Carry on block (../carry-on.js pressLine).
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, prop, attr, element } from '../../render/paint.js';
import { whole, gold } from '../../render/format.js';
import { t } from '../../render/player-text.js';
import { itemName, itemIconHtml, skillName } from '../widgets/bits.js';
import { resultHtml, patchResult, goldFig } from '../result-block.js';
import { awayNowOf } from '../away-recap.js';
import { deathWords, blessingsMissing } from '../death-popup.js';
import { deathLogOf } from '../../session/character-sections.js';
import { huntOf } from '../../session/hunt-sections.js';
import { spanWords, staminaFreeOf, staminaShort } from '../after-hunt.js';
import { outgrownGroundOf } from '../back-in-town.js';
import { refusalWords, playCapOf } from '../intent-words.js';
import { summariesOf } from '../../hunt-view/summary-recorder.js';
import { roomOfHunt } from '../../data/boss-halls.js';
import { trainingOf as trainedBy } from '../../data/training.js';
import { runRulesOf } from '../../data/tower.js';
import { renderCarry, patchCarry, followCarry, pressCarry, pressLine, carryPlanFor } from '../carry-on.js';
import { renderNeeds, patchNeeds } from '../needs-you.js';

/* The away lines the centre holds now, oldest hero slot first. */
const linesOf = (ctx) => (ctx.alerts ? ctx.alerts.list().filter((a) => a.kind === 'away') : []).sort((a, b) => a.slot - b.slot);
const heroOf = (ctx, a) => ctx.peers().find((p) => p.slot === a.slot) || null;
/* A hunt the server can start again with its own settings: never a boss room (its one door is a paid press), a training session (its
   Start is the Training window's) or a run (a climb or a descent: the Tower window's). */
const restartable = (hunt) => !!hunt && !roomOfHunt(hunt) && !trainedBy(hunt) && !runRulesOf(hunt);
/* ...nor a ground the hero outgrew (its hunt ended `outgrown`, hunt-grounds.js endsAtLevel): the server refuses it, and the press is the next
   ground (audit 2026-11-19 L2: "Go to Meadowbrook Thicket", the summary foot's own press), else the Hunt summary */
const outgrownOf = (cs) => { const h = cs ? huntOf(cs) : null; return !!h && h.ended === true && h.endReason === 'outgrown'; };
/* the windows a press opens; `train`, `work` and `farm` are the stamina-free loops too (../after-hunt.js staminaFreeOf) */
const OPENS = Object.freeze({ bag: 'inventory', show: null, work: 'skills-trade', farm: 'farm' });
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
  let why = '', when = '', stamina = '', go = a.action === 'bag' || a.action === 'work' ? a.action : 'show', label = a.button, ground = null, rest = null;
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
    ground = outgrownOf(cs) ? outgrownGroundOf(cs) : null;
    if (restartable(f.hunt) && a.session && !outgrownOf(cs)) { go = 'again'; label = t('controls.hunt_again'); }
    else if (ground) { go = 'ground'; label = t('summary.go_ground', { ground: ground.name }); }
    else { go = 'summary'; label = t('away.card_summary'); }
    /* STAMINA SHORT (audit 2026-11-19 L4, the day-2 return: 1 h 9 min of 12 h and one press, Hunt again on the same ground): the loops this
       hero has open that use none, each a press (../after-hunt.js staminaFreeOf, the server's sections); its line unless the end already said them */
    if (staminaShort(cs)) {
      const loops = staminaFreeOf(cs);
      if (loops.length) rest = { head: now.freeSaid ? '' : t('away.rest_head'), loops: loops.map((l) => ({ go: l.go, label: l.label })) };
    }
  } else if (now) why = now.stamina ? t('away.card_still_stamina', { time: now.stamina }) : t('away.card_still');
  return { name: f.name || '', place: a.work ? '' : f.place || '', result, best: hunt && f.best ? f.best : null, why, when, stamina, go, label,
    ground: ground ? ground.hunt : null, rest,
    /* the card's foot offers the viewed hero's Hunt summary once its hunt has ended (the loot, the trip home) */
    summary: go === 'again' || go === 'ground', bless: blessOf(cs, f) };
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
  return '<div class="haway"><p class="haway-gone"></p>' + renderNeeds() + renderCarry() + '<ol class="haway-heroes"></ol>'
    /* THE FIRST HERO'S PRESS IN THE FOOT TOO (v0.2.141 visual gate, 922x423: with a yard session open the sheet stops above the action bar,
       275 px tall, and Open Training lay under the sticky OK): the same press as the hero's row (its alert, its go), shown in the foot on a
       phone only (summary.css), where the row's own one is hidden, so the one gold press is in view as the card opens */
    + '<div class="hsum-actions haway-foot"><button type="button" class="hh-tool is-primary haway-foot-go" data-hs-act="away-go" hidden></button>'
    + '<button type="button" class="hh-tool is-link" data-hs-act="away-summary" hidden>' + t('away.card_summary') + '</button>'
    + '<button type="button" class="hh-tool" data-hs-act="away-ok">' + t('away.card_ok') + '</button></div></div>';
}

function heroRow(ctx) {
  return element(ctx.doc, '<li class="haway-hero"><header class="haway-head"><h3 class="haway-name"></h3><span class="haway-place"></span></header>'
    + resultHtml()
    + '<p class="haway-best"><span class="hsum-ico"></span><span class="haway-best-name"><small>' + t('away.card_best') + '</small><b></b></span></p>'
    + '<p class="haway-why"></p><p class="haway-when"></p>'
    + '<div class="haway-acts"><button type="button" class="hh-tool" data-hs-act="away-go"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="away-bless" hidden></button><span class="haway-stamina"></span></div>'
    /* stamina short: the loops that use none, each a press (awayBlockOf `rest`) */
    + '<div class="haway-rest" hidden><p class="haway-rest-head"></p><div class="haway-acts haway-rest-go"></div></div>'
    + '<p class="hh-intent-msg haway-msg" role="status" aria-live="polite"></p></li>');
}

renderAway.patch = function patchAway(body, ctx) {
  const root = body.querySelector('.haway');
  const list = linesOf(ctx);
  /* Carry on, while on offer, is the card's one gold press (../carry-on.js) */
  const carry = patchCarry(root.querySelector('.haway-carry'), ctx);
  cls(root, 'is-carry', carry);
  /* what needs a decision, from the server's projection: the heroes' envelopes and the server's Carry on plan */
  patchNeeds(root.querySelector('.haway-needs'), { doc: ctx.doc, peers: () => ctx.peers(), plan: carryPlanFor(ctx), wearOn: !!(carryPlanFor(ctx) || {}).wearOn });
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
      cls(go, 'is-primary', list.indexOf(a) === 0 && !carry);
      const bless = li.querySelector('[data-hs-act="away-bless"]');
      text(bless, b.bless);
      prop(bless, 'hidden', !b.bless);
      const rest = li.querySelector('.haway-rest');
      prop(rest, 'hidden', !b.rest);
      text(rest.querySelector('.haway-rest-head'), b.rest ? b.rest.head : '');
      rows(rest.querySelector('.haway-rest-go'), b.rest ? b.rest.loops : [], {
        key: (l) => l.go,
        build: () => { const btn = element(ctx.doc, '<button type="button" class="hh-tool" data-hs-act="away-free"></button>'); btn.setAttribute('data-alert', a.key); return btn; },
        patch: (el, l) => { text(el, l.label); attr(el, 'data-go', l.go); prop(el, 'disabled', !!a.pending); },
      });
      text(li.querySelector('.haway-msg'), a.msg || '');
    },
  });
  /* the foot's copy of the first hero's press (shown on a phone only): its words, its go, its alert, off while that ask is out */
  const first = list[0] || null, lead = first ? awayBlockOf(heroOf(ctx, first), first) : null;
  const pending = !!(first && first.pending);   // that hero's ask is out: the press says "Sending…", as the row's does
  const footGo = root.querySelector('.haway-foot-go');
  prop(footGo, 'hidden', !first || carry);
  text(footGo, !first ? '' : pending ? t('heroes.sending') : lead.label);
  attr(footGo, 'data-alert', first ? first.key : null);
  attr(footGo, 'data-go', lead ? lead.go : null);
  prop(footGo, 'disabled', pending);
};

/* The window a Needs you press opens for another hero than the one on screen (the hero is shown first). */
const NEEDS_OPENS = Object.freeze({ ground: 'hunts', bless: 'shop', prep: 'hunt-prep', bag: 'inventory' });

/* Every away line is read: the card closing (OK, the close, Esc) or a press that leaves it. */
function dismissAll(ctx) { for (const a of linesOf(ctx)) ctx.alerts.dismiss(a.key); }

renderAway.act = function actAway(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  if (action === 'away-ok') { ctx.wm.close('away'); return true; }
  /* Carry on: the account's one press; each hero that went has its away line read, and the card goes once none is left */
  if (action === 'away-carry') {
    pressCarry(ctx, () => { if (ctx.wm.isOpen('away')) renderAway.patch(body, ctx); }, (slots) => {
      for (const a of linesOf(ctx)) if (slots.includes(a.slot)) ctx.alerts.dismiss(a.key);
      if (!linesOf(ctx).length) ctx.wm.close('away');
    });
    return true;
  }
  /* a company plan line: ONE hr_company_line_set for every hero (../carry-on.js) */
  if (action === 'away-line') {
    pressLine(ctx, () => { if (ctx.wm.isOpen('away')) renderAway.patch(body, ctx); }, el.getAttribute('data-line'), el.getAttribute('data-value'));
    return true;
  }
  /* a Needs you row's press: the window that decides it, the hero it names first (another hero's is shown first, as the hero rows do) */
  if (action === 'away-need') {
    const slot = Number(el.getAttribute('data-slot')), go = el.getAttribute('data-go'), hunt = el.getAttribute('data-hunt');
    const own = ctx.character && ctx.character.slot === slot;
    ctx.wm.close('away');
    if (go === 'ground' && own && hunt) ctx.wm.goTo('hunts', { tab: hunt, find: null });
    else if (go === 'bless' && own) ctx.wm.openTab('shop', 'services');
    else if (ctx.goTo) ctx.goTo(slot, NEEDS_OPENS[go] || null);
    return true;
  }
  /* away-free: a stamina-free loop's press (its own act: a phone hides the first hero's row copy of away-go, summary.css) */
  if (action !== 'away-go' && action !== 'away-summary' && action !== 'away-bless' && action !== 'away-free') return false;
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
  /* the next ground after a ground outgrown: Hunts on that ground, the hero on screen's (as the summary's Go to does, ../goto.js); another hero's is shown first */
  if (go === 'ground') {
    const hunt = awayBlockOf(heroOf(ctx, a), a).ground;
    ctx.wm.close('away');
    if (ctx.character && ctx.character.slot === a.slot && hunt) ctx.wm.goTo('hunts', { tab: hunt, find: null }); else if (ctx.goTo) ctx.goTo(a.slot, 'hunts');
    return true;
  }
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
    followCarry(ctx, () => refresh('away'), !up);
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
